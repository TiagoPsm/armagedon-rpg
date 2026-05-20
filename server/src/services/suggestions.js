function mapSuggestion(row) {
  return {
    id: row.id,
    title: row.title,
    category: row.category || "",
    description: row.description,
    author: row.author || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by || ""
  };
}

async function listSuggestions(client) {
  const result = await client.query(
    `
      select
        s.id,
        s.title,
        s.category,
        s.description,
        s.created_at,
        s.updated_at,
        creator.username as author,
        updater.username as updated_by
      from suggestions s
      left join users creator on creator.id = s.created_by_user_id
      left join users updater on updater.id = s.updated_by_user_id
      order by s.updated_at desc
    `
  );

  return result.rows.map(mapSuggestion);
}

async function createSuggestion(client, userId, username, payload) {
  const result = await client.query(
    `
      insert into suggestions (title, category, description, created_by_user_id, updated_by_user_id)
      values ($1, $2, $3, $4, $4)
      returning id, title, category, description, created_at, updated_at
    `,
    [payload.title, payload.category || "", payload.description, userId]
  );

  return {
    ...mapSuggestion({
      ...result.rows[0],
      author: username,
      updated_by: username
    })
  };
}

async function updateSuggestion(client, suggestionId, userId, username, payload) {
  const result = await client.query(
    `
      update suggestions
      set title = $2,
          category = $3,
          description = $4,
          updated_by_user_id = $5,
          updated_at = now()
      where id = $1
      returning id, title, category, description, created_at, updated_at
    `,
    [suggestionId, payload.title, payload.category || "", payload.description, userId]
  );

  if (!result.rows[0]) return null;

  return mapSuggestion({
    ...result.rows[0],
    updated_by: username
  });
}

async function deleteSuggestion(client, suggestionId) {
  const result = await client.query(
    `
      delete from suggestions
      where id = $1
      returning id
    `,
    [suggestionId]
  );

  return result.rows[0] || null;
}

module.exports = {
  createSuggestion,
  deleteSuggestion,
  listSuggestions,
  updateSuggestion
};
