export const roles = {
  manager: 'Manager',
  reception: 'Reception',
  dining: 'Dining',
  events: 'Events',
};

export const permissions = {
  dashboard: 'dashboard:view',
  reception: 'rooms:operate',
  rates: 'rooms:rates',
  dining: 'dining:operate',
  events: 'events:operate',
  venues: 'hospitality:configure',
  payments: 'hospitality:payments',
  offers: 'offers:manage',
  website: 'website:publish',
  staff: 'staff:manage',
};

export const activityPermissions = [permissions.reception, permissions.dining, permissions.events, permissions.rates, permissions.offers];
