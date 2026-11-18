import { db } from './database.js';

export function activityChanges(before, after, fields) {
  return fields.flatMap(([key, label, format]) => {
    const value = after[key];
    if (!before) return [{ label, value, format }];
    return before[key] === value ? [] : [{ label, from: before[key], value, format }];
  });
}

export function logActivity({ category, department, actor = null, actorType = actor ? 'staff' : 'system', target, action, changes = [] }) {
  db.prepare(`
    INSERT INTO activity_log(category,department,actor,actor_type,target,action,changes,created_at)
    VALUES (?,?,?,?,?,?,?,?)
  `).run(category, department, actor, actorType, target, action, JSON.stringify(changes), new Date().toISOString());
}
