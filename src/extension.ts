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

    // Create status bar magnet
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.command = 'claw.showMenu';
    statusBarItem.text = '$(magnet) Claw';
    statusBarItem.tooltip = 'Click to show Claw menu';
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);

    // Register menu command
    const menuCommand = vscode.commands.registerCommand('claw.showMenu', async () => {
        const selection = await vscode.window.showInformationMessage(
            "Make sure openclaw is ready (click Check if not sure)",
            // "Status", // move it to auto-connect option
            "Dashboard",
            "Check",
            "Onboard",
            "Stop",
            "Gateway",
            "Terminal"
        );

        if (selection) {
            const commandMap: { [key: string]: string } = {
                // 'Status': 'openclaw status', // describe as above
                'Dashboard': 'openclaw dashboard',
                'Gateway': 'openclaw gateway',
                'Stop': 'openclaw gateway stop',
                'Onboard': 'openclaw onboard',
                'Terminal': 'ggc oc',
                'Check': 'check-package'
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
            runClawCommand(context, 'openclaw status');
        }, 1000); // Small delay to ensure everything is initialized
    }

    // Listen for terminal close events
    vscode.window.onDidCloseTerminal((closedTerminal) => {
        if (terminal && closedTerminal === terminal) {
            terminal = undefined;
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

    } catch (error) {
        statusBarItem.text = '$(magnet) Claw';
        statusBarItem.tooltip = 'Click to show Claw menu';
        vscode.window.showErrorMessage(`Failed to execute ${command}: ${error}`);
    }
}

async function checkPackage(context: vscode.ExtensionContext) {
    const isWindows = os.platform() === 'win32';

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
    const parse = (v: string) => {
        v = v.replace(/^v/, '');
        const hyphenIndex = v.indexOf('-');
        let coreStr = v;
        let pre = '';
        if (hyphenIndex !== -1) {
            coreStr = v.substring(0, hyphenIndex);
            pre = v.substring(hyphenIndex + 1);
        }
        const core = coreStr.split('.').map(n => parseInt(n, 10));
        return { core, pre };
    };

    const v1 = parse(current);
    const v2 = parse(latest);

    // Compare core segments
    for (let i = 0; i < Math.max(v1.core.length, v2.core.length); i++) {
        const a = v1.core[i];
        const b = v2.core[i];

        const numA = isNaN(a) ? 0 : a;
        const numB = isNaN(b) ? 0 : b;

        if (numA < numB) return true;
        if (numA > numB) return false;
    }

    // Core versions are equal.
    // If current has pre-release and latest doesn't, current is older (e.g. 1.0.0-beta < 1.0.0)
    if (v1.pre && !v2.pre) return true;

    // If current is release and latest is pre-release, current is usually newer/stable.
    if (!v1.pre && v2.pre) return false;

    // Both have pre-release tags
    if (v1.pre && v2.pre) {
        return v1.pre < v2.pre;
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
