import * as vscode from "vscode"

export const getDevboxInfo = (): {
	sealosDomain: string
	ns: string
	devboxName: string
} | null => {
	const workspaceFolders = vscode.workspace.workspaceFolders

	if (!workspaceFolders || workspaceFolders.length === 0) {
		vscode.window.showErrorMessage("未能找到工作区文件夹，请确保已正确打开远程环境")
		return null
	}
	console.log("workspaceFolders", workspaceFolders)
	vscode.window.showErrorMessage(workspaceFolders[0].uri.authority)

	const workspaceFolder = workspaceFolders[0]
	const remoteUri = workspaceFolder.uri.authority.replace(/^ssh-remote\+/, "")
	if (!remoteUri) {
		vscode.window.showErrorMessage("无法获取远程环境信息")
		return null
	}

	const parts = remoteUri.split("_")
	if (parts.length !== 3) {
		vscode.window.showErrorMessage("远程环境URI格式不正确")
		return null
	}

	const [sealosDomain, ns, devboxName] = parts
	return {
		sealosDomain,
		ns,
		devboxName,
	}
}
