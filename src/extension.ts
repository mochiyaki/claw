import * as vscode from 'vscode';
import * as os from 'os';
import * as cp from 'child_process';
import * as util from 'util';

const exec = util.promisify(cp.exec);

let statusBarItem: vscode.StatusBarItem;
let terminal: vscode.Terminal | undefined;
let ggcTerminal: vscode.Terminal | undefined;

export function activate(context: vscode.ExtensionContext) {
    console.log('Claw extension is now active');

    // Create status bar item
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.command = 'claw.showMenu';
    // statusBarItem.text = '$(plug) Claw'; // '$(hubot) Claw';
    statusBarItem.text = '$(magnet) Claw';
    statusBarItem.tooltip = 'Click to show Claw menu';
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);

    // Register menu command
    const menuCommand = vscode.commands.registerCommand('claw.showMenu', async () => {
        const selection = await vscode.window.showInformationMessage(
            "Connect to Claw? Make sure your openclaw is ready.",
            // "Status",
            "Dashboard",
            "Checker",
            "Onboard",
            "Gateway",
            "Terminal"
        );

        if (selection) {
            const commandMap: { [key: string]: string } = {
                // 'Status': 'openclaw status',
                'Dashboard': 'openclaw dashboard',
                'Gateway': 'openclaw gateway',
                'Onboard': 'openclaw onboard',
                'Terminal': 'ggc oc',
                'Checker': 'check-package'
                // 'Status': 'claw status',
                // 'Onboard': 'claw onboard',
                // 'Gateway': 'claw gateway',
                // 'Terminal': 'claw tui',
                // 'Dashboard': 'claw dashboard'
            };
            const command = commandMap[selection];
            if (command === 'check-package') {
                await checkPackage(context);
            } else if (command) {
                await runClawCommand(context, command);
            }
        }
    });
    context.subscriptions.push(menuCommand);

    // Check auto-connect setting
    const config = vscode.workspace.getConfiguration('claw');
    const autoConnect = config.get<boolean>('autoConnect', false);

    if (autoConnect) {
        // Auto-connect on startup (runs status)
        setTimeout(() => {
            // runClawCommand(context, 'claw status');
            runClawCommand(context, 'openclaw status');
        }, 1000); // Small delay to ensure everything is initialized
    }

    // Listen for terminal close events
    vscode.window.onDidCloseTerminal((closedTerminal) => {
        if (terminal && closedTerminal === terminal) {
            terminal = undefined;
            // statusBarItem.text = '$(plug) Claw'; // '$(hubot) Claw';
            statusBarItem.text = '$(magnet) Claw';
            statusBarItem.tooltip = 'Click to show Claw menu';
        }
        if (ggcTerminal && closedTerminal === ggcTerminal) {
            ggcTerminal = undefined;
        }
    });
}

async function runClawCommand(context: vscode.ExtensionContext, command: string) {
    try {
        // if (command === 'claw status') {
        //     // Update status to connecting for status command
        //     statusBarItem.text = '$(sync~spin) Connecting...';
        //     statusBarItem.tooltip = 'Connection in progress';
        // }

        // Detect OS
        const platform = os.platform();
        const isWindows = platform === 'win32';

        if (command === 'ggc oc') {
            if (!ggcTerminal) {
                const iconPath = vscode.Uri.joinPath(context.extensionUri, 'assets', 'images', 'icon.svg');
                ggcTerminal = vscode.window.createTerminal({
                    name: 'Magnet',
                    iconPath: iconPath
                });
            }
            ggcTerminal.show(true);
            ggcTerminal.sendText(command);
            return;
        }

        // "ggc oc" should run directly on Windows, not through WSL
        // const isGgcOcCommand = command === 'ggc oc';
        // const useWsl = isWindows && !isGgcOcCommand;
        const useWsl = isWindows;

        // Create or reuse terminal
        if (!terminal) {
            const iconPath = vscode.Uri.joinPath(context.extensionUri, 'assets', 'images', 'logo.svg');
            if (useWsl) {
                terminal = vscode.window.createTerminal({
                    name: 'Claw',
                    shellPath: 'wsl.exe',
                    shellArgs: ['-d', 'Ubuntu'],
                    iconPath: iconPath
                });
            } else {
                terminal = vscode.window.createTerminal({
                    name: 'Open',
                    iconPath: iconPath
                });
            }
        }

        // Show terminal and send command
        terminal.show(true); // true = preserve focus
        terminal.sendText(command);

        // if (command === 'openclaw status') {
        //     // Update status to connected after sending status command
        //     statusBarItem.text = '$(check) Claw';
        //     statusBarItem.tooltip = 'Connected to Claw';
        //     vscode.window.showInformationMessage('Claw Status Command Sent');
        // }
    } catch (error) {
        // statusBarItem.text = '$(plug) Claw'; // '$(hubot) Claw';
        statusBarItem.text = '$(magnet) Claw';
        statusBarItem.tooltip = 'Click to show Claw menu';
        vscode.window.showErrorMessage(`Failed to execute ${command}: ${error}`);
    }
}

async function checkPackage(context: vscode.ExtensionContext) {
    const isWindows = os.platform() === 'win32';
    // const npmListCmd = isWindows ? 'wsl -d Ubuntu npm list -g openclaw --json --depth=0' : 'npm list -g openclaw --json --depth=0';
    // const npmViewCmd = isWindows ? 'wsl -d Ubuntu npm view openclaw version' : 'npm view openclaw version';

    // Use --json to reliably parse output, even if there are stderr warnings
    const npmListCmd = isWindows ? 'wsl -d Ubuntu npm list -g openclaw --json --depth=0' : 'npm list -g openclaw --json --depth=0';
    const npmViewCmd = isWindows ? 'wsl -d Ubuntu npm view openclaw version' : 'npm view openclaw version';

    vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "Checking openclaw package...",
        cancellable: false
    }, async (progress) => {
        try {
            // Check installed version
            let installedVersion: string | null = null;
            try {
                const { stdout } = await exec(npmListCmd);
                const result = JSON.parse(stdout);
                if (result.dependencies && result.dependencies.openclaw) {
                    installedVersion = result.dependencies.openclaw.version;
                }
            } catch (e) {
                // If package is not installed, npm list might fail or return empty dependencies
            }

            if (!installedVersion) {
                const selection = await vscode.window.showWarningMessage(
                    'Openclaw is not installed.',
                    'Install Openclaw'
                );
                if (selection === 'Install Openclaw') {
                    await runClawCommand(context, 'npm install -g openclaw');
                }
                return;
            }

            // Check latest version
            let latestVersion = '';
            try {
                const { stdout } = await exec(npmViewCmd);
                latestVersion = stdout.trim();
            } catch (e) {
                vscode.window.showErrorMessage('Failed to check latest version from npm.');
                return;
            }

            if (latestVersion && isOlder(installedVersion, latestVersion)) {
                const selection = await vscode.window.showInformationMessage(
                    `Openclaw update available (Current: ${installedVersion}, Latest: ${latestVersion})`,
                    'Update Openclaw'
                );
                if (selection === 'Update Openclaw') {
                    await runClawCommand(context, 'npm update -g openclaw');
                }
            } else {
                vscode.window.showInformationMessage(`Openclaw is up to date (v${installedVersion}).`);
            }

        } catch (err) {
            vscode.window.showErrorMessage(`Error checking openclaw package: ${err}`);
        }
    });
}

function isOlder(current: string, latest: string): boolean {
    const v1 = current.split('.').map(Number);
    const v2 = latest.split('.').map(Number);
    // Compare major, minor, patch
    for (let i = 0; i < Math.max(v1.length, v2.length); i++) {
        const a = v1[i] || 0;
        const b = v2[i] || 0;
        if (a < b) return true;
        if (a > b) return false;
    }
    return false;
}

export function deactivate() {
    if (terminal) {
        terminal.dispose();
    }
    if (ggcTerminal) {
        ggcTerminal.dispose();
    }
}
