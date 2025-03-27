export const getDevboxInfo = () => {
	const sealosDomain = process.env.SEALOS_DOMAIN
	const namespace = process.env.NAMESPACE
	const devboxName = process.env.DEVBOX_NAME

	if (!sealosDomain || !namespace || !devboxName) {
		return null
	}

	return {
		sealosDomain,
		namespace,
		devboxName,
	}
}
