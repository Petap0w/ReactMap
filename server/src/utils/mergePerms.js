// @ts-check

/**
 *
 * @param {import("@rm/types").Permissions} existingPerms
 * @param {import("@rm/types").Permissions} incomingPerms
 */
function mergePerms(existingPerms, incomingPerms) {
  const allKeys = new Set([
    ...Object.keys(existingPerms),
    ...Object.keys(incomingPerms),
  ])

  return /** @type {import("@rm/types").Permissions} */ (
    Object.fromEntries(
      Array.from(allKeys).map((key) => {
        const existing = existingPerms[key]
        const incoming = incomingPerms[key]

        if (Array.isArray(existing) || Array.isArray(incoming)) {
          return [
            key,
            [
              ...new Set([
                ...(Array.isArray(existing) ? existing : []),
                ...(Array.isArray(incoming) ? incoming : []),
              ]),
            ],
          ]
        }
        return [key, existing || incoming]
      }),
    )
  )
}

module.exports = { mergePerms }
