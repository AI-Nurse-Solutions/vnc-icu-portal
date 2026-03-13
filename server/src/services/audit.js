const db = require('../config/db');

async function logAction({ actorId, action, targetType, targetId, details }) {
  await db.query(
    `INSERT INTO audit_log (actor_id, action, target_type, target_id, details)
     VALUES ($1, $2, $3, $4, $5)`,
    [actorId, action, targetType, targetId, details ? JSON.stringify(details) : null]
  );
}

module.exports = { logAction };
