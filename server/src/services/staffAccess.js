import { db } from './database.js';
import { fail } from './booking.js';
import { permissions } from '../../../shared/staffAccess.mjs';

const roleAccess = {
  manager: Object.values(permissions),
  reception: [permissions.reception],
  dining: [permissions.dining],
  events: [permissions.events],
};

export function staffAccount(username) {
  const row = db.prepare(`
    SELECT a.username, s.role, s.enabled, s.change_rates, s.publish_content, s.record_payments, s.must_change_password
    FROM admins a LEFT JOIN staff_accounts s ON s.username=a.username WHERE a.username=?
  `).get(username);
  if (!row) return null;
  const role = row.role ?? 'manager';
  const manager = role === 'manager';
  return {
    username: row.username,
    role,
    enabled: row.enabled === null || Boolean(row.enabled),
    mustChangePassword: Boolean(row.must_change_password),
    grants: {
      changeRates: manager || Boolean(row.change_rates),
      publishContent: manager || Boolean(row.publish_content),
      recordPayments: manager || Boolean(row.record_payments),
    },
  };
}

export function staffProfile(account) {
  const { username, role, mustChangePassword, enabled, grants } = account;
  const access = new Set(roleAccess[role]);
  if (grants.changeRates) access.add(permissions.rates);
  if (grants.publishContent) access.add(permissions.website);
  if (grants.recordPayments && ['dining', 'events'].includes(role)) access.add(permissions.payments);
  return { username, role, mustChangePassword, permissions: enabled && !mustChangePassword ? [...access] : [] };
}

export function assertPermission(req, ...allowed) {
  if (req.staff.mustChangePassword) fail('Change your temporary password before continuing.', 403);
  if (!allowed.some(permission => req.staff.permissions.includes(permission))) {
    fail('Your staff account does not have permission for this action.', 403);
  }
}

export function requirePermission(...allowed) {
  return (req, _res, next) => {
    assertPermission(req, ...allowed);
    next();
  };
}

export function allowedBookingKinds(profile) {
  return [
    ...(profile.permissions.includes(permissions.reception) ? ['rooms'] : []),
    ...(profile.permissions.includes(permissions.dining) ? ['dining'] : []),
    ...(profile.permissions.includes(permissions.events) ? ['events'] : []),
  ];
}
