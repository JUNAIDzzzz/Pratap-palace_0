export const reportDefinitions = {
  arrivals: {
    title: 'Room arrivals',
    description: 'Room reservations with check-in in the selected period, including pending requests and completed stays.',
    columns: [
      ['checkIn', 'Check-in'], ['checkOut', 'Check-out'], ['reference', 'Reference'], ['guest', 'Guest'],
      ['room', 'Room type'], ['quantity', 'Rooms'], ['guests', 'Guests'], ['status', 'Status', 'status'],
    ],
  },
  occupancy: {
    title: 'Room occupancy',
    description: 'Booked room nights divided by current physical inventory less dated maintenance blocks. Pending holds are shown separately. This measures bookings, not physical check-in attendance.',
    columns: [
      ['date', 'Night'], ['inventory', 'Physical rooms'], ['blocked', 'Maintenance blocks'], ['sellable', 'Sellable rooms'],
      ['booked', 'Booked rooms'], ['pending', 'Pending holds'], ['percent', 'Booked (%)', 'percent'],
    ],
  },
  cancellations: {
    title: 'Cancellations and declines',
    description: 'Room cancellations and declined event enquiries, dated by when staff applied the status.',
    columns: [
      ['changedAt', 'Changed at (IST)', 'timestamp'], ['serviceDate', 'Service date'], ['reference', 'Reference'],
      ['department', 'Department', 'department'], ['guest', 'Guest'], ['resource', 'Room type or venue'],
      ['status', 'Outcome', 'status'], ['total', 'Original value (INR)', 'money'],
    ],
  },
  outstanding: {
    title: 'Outstanding payments',
    description: 'Current balances for active dining holds, accepted event quotes, and partial payments under review for bookings in the selected service dates.',
    columns: [
      ['serviceDate', 'Service date'], ['reference', 'Reference'], ['department', 'Department', 'department'], ['guest', 'Guest'],
      ['resource', 'Restaurant or venue'], ['status', 'Status', 'status'], ['total', 'Agreed amount (INR)', 'money'],
      ['verified', 'Verified payments (INR)', 'money'], ['balance', 'Outstanding (INR)', 'money'],
    ],
  },
};

export const departmentLabels = { rooms: 'Rooms', dining: 'Dining', events: 'Events' };
