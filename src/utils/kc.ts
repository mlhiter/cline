import * as yaml from "yaml"

export interface KubeConfig {
	apiVersion: string
	kind: string
	currentContext: string
	preferences: Record<string, any>
	clusters: Array<{
		name: string
		cluster: {
			server: string
			"certificate-authority-data"?: string
		}
	}>
	contexts: Array<{
		name: string
		context: {
			cluster: string
			namespace?: string
			user: string
		}
	}>
	users: Array<{
		name: string
		user: {
			token?: string
			"client-certificate-data"?: string
			"client-key-data"?: string
		}
	}>
}

export function parseKubeconfig(content: string): KubeConfig {
	try {
		const config = yaml.parse(content) as KubeConfig

		if (!config.apiVersion || !config.kind || config.kind !== "Config") {
			throw new Error("Invalid kubeconfig file format")
		}

		if (!Array.isArray(config.clusters) || !Array.isArray(config.contexts) || !Array.isArray(config.users)) {
			throw new Error("kubeconfig missing required fields")
		}

		return config
	} catch (error) {
		throw new Error(`Failed to parse kubeconfig: ${error instanceof Error ? error.message : "unknown error"}`)
	}
}

export function getDevboxEnvInfo(kcString: string) {
	const config = parseKubeconfig(kcString)

	const { namespace, user } = config.contexts[0].context
	const { server } = config.clusters[0].cluster // https://hzh.sealos.run:6443

	return {
		namespace,
		user,
		sealosDomain: server.replace("https://", "").split(":")[0],
		server,
	}
}
