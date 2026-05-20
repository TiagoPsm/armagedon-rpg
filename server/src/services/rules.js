function normalizeRuleTags(value) {
  const rawTags = Array.isArray(value)
    ? value
    : String(value || "").split(",");
  const seen = new Set();
  return rawTags
    .map(tag => String(tag || "").trim())
    .filter(Boolean)
    .filter(tag => {
      const key = tag.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function serializeRuleTags(payload = {}) {
  return normalizeRuleTags(payload.tags || payload.tag).join(", ");
}

async function listRules(client) {
  const result = await client.query(
    `
      select
        r.id,
        r.title,
        r.tag,
        r.content,
        r.created_at,
        r.updated_at,
        creator.username as created_by,
        updater.username as updated_by
      from rules_posts r
      left join users creator on creator.id = r.created_by_user_id
      left join users updater on updater.id = r.updated_by_user_id
      order by r.updated_at desc
    `
  );

  return result.rows.map(row => ({
    id: row.id,
    title: row.title,
    tag: row.tag,
    tags: normalizeRuleTags(row.tag),
    content: row.content,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
    updatedBy: row.updated_by
  }));
}

async function createRule(client, userId, payload) {
  const tag = serializeRuleTags(payload);
  const result = await client.query(
    `
      insert into rules_posts (title, tag, content, created_by_user_id, updated_by_user_id)
      values ($1, $2, $3, $4, $4)
      returning id, title, tag, content, created_at, updated_at
    `,
    [payload.title, tag, payload.content, userId]
  );

  const row = result.rows[0];
  return row ? { ...row, tags: normalizeRuleTags(row.tag) } : row;
}

async function updateRule(client, ruleId, userId, payload) {
  const tag = serializeRuleTags(payload);
  const result = await client.query(
    `
      update rules_posts
      set title = $2,
          tag = $3,
          content = $4,
          updated_by_user_id = $5,
          updated_at = now()
      where id = $1
      returning id, title, tag, content, created_at, updated_at
    `,
    [ruleId, payload.title, tag, payload.content, userId]
  );

  const row = result.rows[0] || null;
  return row ? { ...row, tags: normalizeRuleTags(row.tag) } : null;
}

async function deleteRule(client, ruleId) {
  const result = await client.query(
    `
      delete from rules_posts
      where id = $1
      returning id
    `,
    [ruleId]
  );

  return result.rows[0] || null;
}

module.exports = {
  createRule,
  deleteRule,
  listRules,
  updateRule
};
