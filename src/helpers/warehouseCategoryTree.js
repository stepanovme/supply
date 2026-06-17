const normalizeName = (value) => String(value || '').trim()

const sortByName = (a, b) => a.name.localeCompare(b.name, 'ru')

export const buildWarehouseCategoryTree = (items) => {
  const source = Array.isArray(items) ? items : []
  const byId = new Map()

  source.forEach((item) => {
    const id = String(item?.id || '').trim()
    if (!id) return
    byId.set(id, {
      id,
      name: normalizeName(item?.name),
      parentId: String(item?.parent_id || item?.parentId || '').trim(),
    })
  })

  const childrenByParent = new Map()
  byId.forEach((node) => {
    const parentKey = node.parentId && byId.has(node.parentId) ? node.parentId : ''
    if (!childrenByParent.has(parentKey)) childrenByParent.set(parentKey, [])
    childrenByParent.get(parentKey).push(node)
  })

  childrenByParent.forEach((children) => children.sort(sortByName))

  const flat = []
  const metaById = new Map()
  const visited = new Set()
  const stack = new Set()

  const dfs = (node, depth, pathIds, pathNames) => {
    if (!node || visited.has(node.id) || stack.has(node.id)) return
    stack.add(node.id)

    const nextPathIds = [...pathIds, node.id]
    const nextPathNames = [...pathNames, node.name || node.id]
    const pathLabel = nextPathNames.join('. ')
    const parentPathLabel = pathNames.join('. ')

    const meta = {
      ...node,
      depth,
      pathIds: nextPathIds,
      pathNames: nextPathNames,
      pathLabel,
      parentPathLabel,
    }

    flat.push(meta)
    metaById.set(node.id, meta)
    visited.add(node.id)

    const children = childrenByParent.get(node.id) || []
    children.forEach((child) => dfs(child, depth + 1, nextPathIds, nextPathNames))
    stack.delete(node.id)
  }

  const roots = childrenByParent.get('') || []
  roots.forEach((root) => dfs(root, 0, [], []))

  byId.forEach((node) => {
    if (!visited.has(node.id)) dfs(node, 0, [], [])
  })

  return {
    flat,
    byId: metaById,
  }
}
