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
    content: row.content,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
    updatedBy: row.updated_by
  }));
}

async function createRule(client, userId, payload) {
  const result = await client.query(
    `
      insert into rules_posts (title, tag, content, created_by_user_id, updated_by_user_id)
      values ($1, $2, $3, $4, $4)
      returning id, title, tag, content, created_at, updated_at
    `,
    [payload.title, payload.tag || "", payload.content, userId]
  );

  return result.rows[0];
}

async function updateRule(client, ruleId, userId, payload) {
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
    [ruleId, payload.title, payload.tag || "", payload.content, userId]
  );

  return result.rows[0] || null;
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
