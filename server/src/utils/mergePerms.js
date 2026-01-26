// @ts-check

/**
 *
 * @param {import("@rm/types").Permissions} existingPerms
 * @param {import("@rm/types").Permissions} incomingPerms
 */
function mergePerms(existingPerms, incomingPerms) {
  // Get all keys from both objects to ensure we don't miss any
  const allKeys = new Set([
    ...Object.keys(existingPerms),
    ...Object.keys(incomingPerms),
  ])
  
  return /** @type {import("@rm/types").Permissions} */ (
    Object.fromEntries(
      Array.from(allKeys).map((key) => {
        const existing = existingPerms[key]
        const incoming = incomingPerms[key]
        
        // Handle arrays (areaRestrictions, webhooks, scanner)
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
        
        // For booleans, prefer true values (OR logic)
        // This ensures Discord permissions can override local false values
        return [key, existing || incoming]
      }),
    )
  )
}

module.exports = { mergePerms }
