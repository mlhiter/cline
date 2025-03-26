import * as os from "os"
import * as path from "path"
import { promisify } from "util"
import * as vscode from "vscode"
import * as fs from "fs/promises"
import { exec } from "child_process"
import { fileExistsAtPath } from "../../../utils/fs"

const execAsync = promisify(exec)

interface McpSettings {
	mcpServers: {
		[key: string]: {
			command: string
			args: string[]
			env: Record<string, string>
			autoApprove: string[]
			disabled: boolean
		}
	}
}

/**
 * Download the Sealos MCP server from the GitHub repository and add it to the Cline configuration
 */
export const downloadSealosMcp = async (mcpSettingsPath: string) => {
	const repoUrl = "https://github.com/bearslyricattack/mcpServers.git"

	const userDocumentsPath = path.join(os.homedir(), "Documents")
	const mcpServersDir = path.join(userDocumentsPath, "Cline", "MCP")
	const sealosMcpDir = path.join(mcpServersDir, "Sealos") // Specify the storage location as ~/Documents/Cline/MCP/Sealos

	await ensureDirectoryExists(mcpServersDir)

	try {
		try {
			await fs.access(sealosMcpDir)
			console.log("Updating the Sealos MCP repository...")
			await execAsync("git pull", { cwd: sealosMcpDir })
		} catch {
			console.log("Cloning the Sealos MCP repository...")
			await execAsync(`git clone ${repoUrl} ${sealosMcpDir}`)
		}

		// Scan all frontend directories
		const frontendDirs: string[] = await scanFrontendDirs(sealosMcpDir)
		console.log("Found frontend directories:", frontendDirs)

		// Build the frontend code
		for (const frontendDir of frontendDirs) {
			try {
				console.log(`Packing the frontend directory: ${frontendDir}`)
				// Check if there is a package.json file
				const packageJsonPath = path.join(frontendDir, "package.json")
				try {
					await fs.access(packageJsonPath)
					// Install dependencies
					await execAsync("npm install", { cwd: frontendDir })

					const packageJsonContent = await fs.readFile(packageJsonPath, "utf-8")
					const packageJson = JSON.parse(packageJsonContent)
					if (packageJson.scripts && packageJson.scripts.build) {
						await execAsync("npm run build", { cwd: frontendDir })
						console.log(`${frontendDir} built`)
					} else {
						console.log(`${frontendDir} does not have a build script, skipping build`)
					}
				} catch {
					console.log(`${frontendDir} does not have a package.json file, skipping build`)
				}
			} catch (error) {
				console.error(`Error building ${frontendDir}:`, error)
				vscode.window.showErrorMessage(`Error building ${path.basename(path.dirname(frontendDir))} frontend: ${error}`)
			}
		}

		// Scan the MCP server directory to find the entry file
		const mcpServers: {
			name: string
			command: string
			args: string[]
			env?: Record<string, string>
		}[] = []

		for (const frontendDir of frontendDirs) {
			// Go back from the frontend directory to find the server directory
			const serverDir = path.dirname(frontendDir)
			const serverName = path.basename(serverDir)

			// Find the entry file after the frontend directory
			const buildDir = path.join(frontendDir, "build")
			const distDir = path.join(frontendDir, "dist")

			let indexJsPath = null

			// Check the build directory first
			try {
				await fs.access(buildDir)
				const buildIndexPath = path.join(buildDir, "index.js")
				try {
					await fs.access(buildIndexPath)
					indexJsPath = buildIndexPath
				} catch {}
			} catch {
				try {
					await fs.access(distDir)
					const distIndexPath = path.join(distDir, "index.js")
					try {
						await fs.access(distIndexPath)
						indexJsPath = distIndexPath
					} catch {}
				} catch {}
			}

			// If no build file is found, try to find other entry files
			if (!indexJsPath) {
				indexJsPath = await findIndexJs(serverDir)
			}

			if (indexJsPath) {
				mcpServers.push({
					name: serverName,
					command: "node",
					args: [indexJsPath],
					env: {},
				})
			}
		}

		// Save the found MCP servers to the configuration file
		if (mcpServers.length > 0) {
			await saveMcpServersToConfig(mcpSettingsPath, mcpServers)
			vscode.window.showInformationMessage(`Added ${mcpServers.length} MCP servers to the configuration`)
		} else {
			vscode.window.showWarningMessage("No usable MCP servers found")
		}

		return frontendDirs
	} catch (error) {
		console.error("Error downloading or scanning:", error)
		vscode.window.showErrorMessage(`Error processing MCP servers: ${error}`)
		throw error
	}
}

async function ensureDirectoryExists(dirPath: string) {
	try {
		await fs.access(dirPath)
	} catch {
		await fs.mkdir(dirPath, { recursive: true })
	}
}

async function scanFrontendDirs(dir: string): Promise<string[]> {
	const frontendDirs: string[] = []

	async function scan(currentDir: string) {
		const items = await fs.readdir(currentDir)
		for (const item of items) {
			const fullPath = path.join(currentDir, item)
			const stat = await fs.stat(fullPath)

			if (stat.isDirectory()) {
				if (item === "frontend") {
					frontendDirs.push(fullPath)
				} else {
					await scan(fullPath)
				}
			}
		}
	}

	await scan(dir)
	return frontendDirs
}

async function findIndexJs(dir: string): Promise<string | null> {
	// Check the build/index.js first
	const buildIndexPath = path.join(dir, "build", "index.js")
	try {
		await fs.access(buildIndexPath)
		return buildIndexPath
	} catch {}

	// Check dist/index.js
	const distIndexPath = path.join(dir, "dist", "index.js")
	try {
		await fs.access(distIndexPath)
		return distIndexPath
	} catch {}

	// Check the root index.js
	const rootIndexPath = path.join(dir, "index.js")
	try {
		await fs.access(rootIndexPath)
		return rootIndexPath
	} catch {}

	const srcIndexPath = path.join(dir, "src", "index.js")
	try {
		await fs.access(srcIndexPath)
		return srcIndexPath
	} catch {}

	// Recursively find js files
	try {
		const files = await fs.readdir(dir)
		for (const file of files) {
			const fullPath = path.join(dir, file)
			const stat = await fs.stat(fullPath)
			if (stat.isDirectory()) {
				const foundPath = await findIndexJs(fullPath)
				if (foundPath) {
					return foundPath
				}
			}
		}
	} catch {}

	return null
}

/**
 * Save the MCP servers to the Cline configuration
 */
async function saveMcpServersToConfig(
	mcpSettingsPath: string,
	mcpServers: {
		name: string
		command: string
		args: string[]
		env?: Record<string, string>
	}[],
) {
	try {
		const fileExists = await fileExistsAtPath(mcpSettingsPath)
		if (!fileExists) {
			await fs.writeFile(
				mcpSettingsPath,
				`{
  "mcpServers": {

  }
}`,
			)
		}

		// Read the existing configuration or create a new one
		let mcpSettings: McpSettings = { mcpServers: {} }
		try {
			await fs.access(mcpSettingsPath)
			const content = await fs.readFile(mcpSettingsPath, "utf-8")
			mcpSettings = JSON.parse(content) as McpSettings
		} catch {}

		// Add or update MCP servers
		for (const server of mcpServers) {
			const serverKey = `sealos-${server.name}`
			mcpSettings.mcpServers[serverKey] = {
				command: server.command,
				args: server.args,
				env: server.env || {},
				autoApprove: [],
				disabled: false,
			}
		}

		// Save the configuration
		await fs.writeFile(mcpSettingsPath, JSON.stringify(mcpSettings, null, 2))
		console.log("MCP servers configuration saved to:", mcpSettingsPath)
	} catch (error) {
		console.error("Error saving MCP configuration:", error)
		throw error
	}
}
