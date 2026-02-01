import * as vscode from 'vscode';
import * as os from 'os';

let statusBarItem: vscode.StatusBarItem;
let terminal: vscode.Terminal | undefined;

export function activate(context: vscode.ExtensionContext) {
    console.log('Claw extension is now active');

    // Create status bar item
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.command = 'claw.showMenu';
    // statusBarItem.text = '$(plug) Claw';
    statusBarItem.text = '$(hubot) Claw';
    statusBarItem.tooltip = 'Click to show Claw menu';
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);

    // Register menu command
    let menuCommand = vscode.commands.registerCommand('claw.showMenu', async () => {
        const selection = await vscode.window.showInformationMessage(
            "Connect to Claw? Make sure your claw is ready.",
            "Status",
            "Onboard",
            "Gateway",
            "Terminal",
            "Dashboard"
        );

        if (selection) {
            const commandMap: { [key: string]: string } = {
                'Status': 'claw status',
                'Onboard': 'claw onboard',
                'Gateway': 'claw gateway',
                'Terminal': 'claw tui',
                'Dashboard': 'claw dashboard'
            };
            const command = commandMap[selection];
            if (command) {
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
            runClawCommand(context, 'claw status');
        }, 1000); // Small delay to ensure everything is initialized
    }

    // Listen for terminal close events
    vscode.window.onDidCloseTerminal((closedTerminal) => {
        if (terminal && closedTerminal === terminal) {
            terminal = undefined;
            // statusBarItem.text = '$(plug) Claw';
            statusBarItem.text = '$(hubot) Claw';
            statusBarItem.tooltip = 'Click to show Claw menu';
        }
    });
}

async function runClawCommand(context: vscode.ExtensionContext, command: string) {
    try {
        if (command === 'claw status') {
            // Update status to connecting for status command
            statusBarItem.text = '$(sync~spin) Connecting...';
            statusBarItem.tooltip = 'Connection in progress';
        }

        // Detect OS
        const platform = os.platform();
        const isWindows = platform === 'win32';

        // Create or reuse terminal
        if (!terminal) {
            const iconPath = vscode.Uri.joinPath(context.extensionUri, 'assets', 'images', 'logo.svg');
            if (isWindows) {
                terminal = vscode.window.createTerminal({
                    name: 'Claw',
                    shellPath: 'wsl.exe',
                    shellArgs: ['-d', 'Ubuntu'],
                    iconPath: iconPath
                });
            } else {
                terminal = vscode.window.createTerminal({
                    name: 'Claw',
                    iconPath: iconPath
                });
            }
        }

        // Show terminal and send command
        terminal.show(true); // true = preserve focus
        terminal.sendText(command);

        if (command === 'openclaw status') {
            // Update status to connected after sending status command
            statusBarItem.text = '$(check) Claw';
            statusBarItem.tooltip = 'Connected to Claw';
            vscode.window.showInformationMessage('Claw Status Command Sent');
        }
    } catch (error) {
        // statusBarItem.text = '$(plug) Claw';
        statusBarItem.text = '$(hubot) Claw';
        statusBarItem.tooltip = 'Click to show Claw menu';
        vscode.window.showErrorMessage(`Failed to execute ${command}: ${error}`);
    }
}

export function deactivate() {
    if (terminal) {
        terminal.dispose();
    }
}
