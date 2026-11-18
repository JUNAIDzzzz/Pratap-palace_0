import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateInquiry } from './middleware/validateInquiry.js';
const valid={name:'Test Guest',email:'guest@example.com',checkIn:'2099-01-01',checkOut:'2099-01-03',guests:'2',room:'deluxe'};
test('accepts a valid inquiry',()=>assert.equal(validateInquiry(valid),null));
test('rejects departure before arrival',()=>assert.match(validateInquiry({...valid,checkOut:'2098-01-01'}),/after check-in/));
test('rejects nonexistent dates',()=>assert.match(validateInquiry({...valid,checkIn:'2099-02-31'}),/valid arrival/));
test('rejects excess room occupancy',()=>assert.match(validateInquiry({...valid,guests:'4'}),/up to 2/));
test('rejects missing contact details',()=>assert.match(validateInquiry({...valid,email:''}),/email/));
