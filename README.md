# Pratap Palace

Hotel website built with React, Vite, Tailwind CSS v4 and Node.js / Express. Booking data and admin accounts persist in SQLite using Node's built-in `node:sqlite` module.

## Requirements and development

Node.js 22.16+ is required. SQLite may print an experimental-feature warning on Node 22.

```sh
npm install
npm run admin:create -w server
npm run dev
```

Open http://localhost:5173 for the hotel, `/booking` for room search and `/admin` for administration. The backend automatically reads `server/.env`. `ADMIN_USERNAME` and `ADMIN_PASSWORD` initialize an admin if that username does not yet exist. The admin creation command also reads these settings; without an environment password it generates a random one. Neither startup nor this command overwrites an existing account password. Change the temporary password in Admin → Settings. To create an additional named admin, run `npm run admin:create -w server -- manager`.

Vite proxies `/api` to the backend port. Both servers read `PORT` from `server/.env` and honor a shell override. The default is 5000. If that port is occupied, set `PORT` to an unused port in `server/.env` and restart both servers. Run commands from the project root. Development servers should run in the same network environment as your browser.

## Booking configuration

Sign in to `/admin`, open **Rooms & rates**, and enter actual nightly rates and physical room counts. Enable **Accept new reservations** to make a room type bookable. Rooms start disabled with zero rate and zero inventory so sample prices and counts never become live availability. Rates are complete per-room nightly amounts in INR; include any applicable taxes and mandatory fees in the configured rate. There is no separate tax engine.

Guests select check-in/check-out, guests, room quantity and an optional offer code. Results show the server-calculated complete stay amount. A reservation request saves a unique reference and starts **pending**. Pending requests immediately hold inventory until an admin confirms or cancels them; they do not auto-expire. Admins can confirm, cancel, check in, and check out reservations. Cancelled reservations release inventory and cannot be reopened. Date ranges are check-in inclusive, check-out exclusive, using the hotel's Asia/Kolkata calendar.

Room assignments and housekeeping are managed in admin. Guest notification delivery requires provider setup. The admin dashboard's reservation value is not collected revenue. Existing reservation prices remain unchanged after rate or offer edits. Old inquiry submissions remain in `server/data/inquiries.jsonl` and are separate from reservations.

## Admin panel

- Overview: reservations, pending requests, today's arrivals, in-house room counts, confirmed reservation value.
- Reservations: search, status filtering, pagination, guest/contact details, price breakdown and status management.
- Rooms & rates: nightly rates, physical inventory, online availability controls.
- Offer codes: percentage discounts with eligible check-in date ranges and enable/disable controls.
- Settings: change password; all existing sessions are revoked after a change.
- Activity history: review booking, rate, offer, and verified payment changes by actor and time in IST. Staff see the departments and activity types their role permits. Existing dining and event history is included. Room, rate, and offer changes appear from the time activity logging was enabled.
- Reports: managers can preview and export room arrivals, booked occupancy, cancellations and event declines, and outstanding dining and event balances. Reports use inclusive IST dates. Reservation value uses check-in or service dates and includes the full agreed value of confirmed reservations. Verified payments use the date a receipt was recorded. Occupancy uses the current configured physical inventory less maintenance for each night, with pending holds counted separately. Outstanding balances are current as of report generation. Room payments are outside the verified-payment ledger.
- Staff accounts: managers create personal logins, change access, disable accounts, or set a new temporary password. Existing admin accounts retain Manager access. Staff must replace a temporary password before opening their tools.

| Role | Default access |
| --- | --- |
| Manager | All departments, dashboard, rates, offer codes, website publishing, payments, and staff accounts |
| Reception | Room reservations, assignments, housekeeping, and the room calendar |
| Dining | Dining reservations and the dining calendar |
| Events | Event reservations, quotes, and the event calendar |

Managers can grant room rate and inventory editing or website publishing to individual staff. Dining and Events staff can also be granted permission to record verified payments for their own department. Managers configure dining and event resources, packages, and policies. Permission changes, disabling an account, and password resets revoke that account's active sessions.

Admin passwords use salted scrypt hashes. Sessions use random HttpOnly, SameSite=Strict cookies, expire after eight hours and are stored as hashes. Sign-in and reservation endpoints are rate limited. Write requests reject cross-site origins and require JSON. Reservation creation checks availability inside an immediate SQLite transaction and supports idempotent retries.

## API reference

All routes are under `/api`. Date strings are `YYYY-MM-DD`. All API money amounts are integer paise (100 paise = 1 INR). Search requests use `quantity` for rooms and `guests` for the total party size.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/health` | Health check |
| GET | `/rooms` | Public room catalog |
| GET | `/availability?checkIn=2026-12-01&checkOut=2026-12-03&guests=2&quantity=1&promoCode=` | Available room types and complete stay quotes |
| POST | `/bookings` | Create pending reservation; send `Idempotency-Key` header with a unique UUID |
| POST | `/admin/login` | Sign in with `{username,password}` |
| GET | `/admin/me` | Current authenticated admin |
| POST | `/admin/logout` | Sign out; body `{}` |
| POST | `/admin/password` | `{currentPassword,newPassword}`; revokes sessions |
| GET | `/admin/dashboard` | Summary metrics |
| GET | `/admin/bookings?status=&search=&page=1` | Reservation list, 25 per page |
| PATCH | `/admin/bookings/:id` | `{status}` transition |
| GET | `/admin/rooms` | Room inventory and rates |
| PATCH | `/admin/rooms/:id` | `{rate,inventory,active,revision}`; rate in paise. Use the `settings_revision` returned by the room API. |
| GET | `/admin/offers` | Offer code list |
| POST | `/admin/offers` | Create a new code with `{code,percent,starts,ends,active}` |
| PUT | `/admin/offers/:code` | Update an existing code with `{percent,starts,ends,active}` |
| POST | `/inquiries` | Legacy inquiry endpoint; separate from reservations |

Example booking JSON:

```json
{
  "roomId": "deluxe",
  "checkIn": "2026-12-01",
  "checkOut": "2026-12-03",
  "guests": 2,
  "quantity": 1,
  "promoCode": "",
  "name": "Guest Name",
  "email": "guest@example.com",
  "phone": "+91 99999 99999",
  "notes": "",
  "expectedTotal": 1000000
}
```

Send the actual quote total in the required `expectedTotal` field. A changed total returns HTTP 409 for guest review. Reuse the same idempotency key only for retries of the same reservation at the same total. Errors return `{message}` with an appropriate status.

## Production build

```sh
npm run build
npm start
```

Express serves the compiled frontend and APIs on http://localhost:5000. Set `PORT` to change its port. Set `NODE_ENV=production` and `PUBLIC_ORIGIN=https://your-domain.example` behind an HTTPS reverse proxy. The server binds to loopback intentionally. Secure cookies require HTTPS in production. The server automatically loads `server/.env`; externally set environment variables take precedence. `.env.example` documents the available settings. `.env` is ignored by Git and never sent to the frontend. Environment credentials initialize missing accounts only; changing a password in Admin → Settings remains effective after server restarts.

For per-visitor rate limits behind a reverse proxy, set `TRUSTED_PROXY_ADDRESSES` to the exact IP addresses of the proxies you control, for example `127.0.0.1` for a same-machine proxy. Configure the publicly facing proxy to overwrite incoming `X-Forwarded-For` and `X-Forwarded-Proto` with the client IP and request scheme it observes. Keep direct backend access restricted to the proxy when trust is enabled. Leave the setting empty for direct local development.

SQLite defaults to `server/data/hotel.sqlite`; set `DATABASE_PATH` to override it. This folder contains private guest data and must stay outside publicly served directories. Preserve and back up the SQLite database using SQLite backup tooling, including active WAL data. Local SQLite supports this single-server setup; multi-server hosting needs a shared transactional database and shared rate limiting.

## Verification

```sh
npm test
npm run build
```

Tests use an isolated in-memory SQLite database and cover authentication, API access, availability, concurrent reservation attempts, idempotency, cancellations, occupancy, discounts, price changes, and malformed inputs. No test data is written to the actual hotel database.

## Folder structure

```text
client/src/
  components/
    layout/       Header and footer
    home/         Hero-adjacent content, rooms and scroll gallery
    booking/      Reusable booking search bar
    admin/        Reservations, room settings, offers and password settings
    ui/           Shared UI
  pages/          Home, Booking, Admin
  services/       API helpers and gallery data
  styles.css      Tailwind theme and shared styles
server/
  scripts/        Admin account bootstrap
  src/
    data/         Initial illustrative room descriptions
    middleware/   Legacy inquiry validation
    routes/       Public catalog, booking, admin APIs
    services/     SQLite schema, transactions, auth and booking logic
    app.js        Express middleware and routes
    index.js      Server entry point
  test/           Booking and authentication integration tests
  data/           SQLite and legacy inquiry data (ignored by Git)
```

Room descriptions and catalog photos are illustrative until replaced with verified hotel information. The gallery uses frames extracted from the supplied hotel video. External fonts and catalog images require internet access.


## Dining and event reservations

Guest pages: `/dining`, `/events`, and `/manage`. Admin navigation now includes **Dining bookings** and **Event bookings**. All data persists in the same SQLite database, in the `hospitality_*` tables, separately from hotel room reservations.

### Initial configuration

Pratap Palace Dining and Pratap Palace Events are created as unpublished drafts. Dining service-period starting values are breakfast 07:00–10:30, lunch 12:00–15:00, and dinner 19:00–23:00 IST. These are suggested editable values, not a claimed Taj policy. Events initially use an editable 08:00–23:00 service period. All reservations must fit a same-day service period; overnight functions must be arranged separately.

In Admin → Dining bookings → Restaurants & policies, enter the actual physical table identifiers and seat counts, per-guest prepaid package amount, inclusions, and approved guest policies. You can set open weekdays, closure dates, seating duration, arrival interval, maximum party size, table combinations, lead time, and payment-hold duration. The amount includes all mandatory charges; there is no separate tax or child-discount calculation. Children count toward seats and the configured full per-guest package amount. Publish only after reviewing those details.

In Admin → Event bookings → Venues & policies, enter real layout capacities, policies, operating hours, setup/teardown buffers, lead time, and quote-hold duration. Add multiple venues or restaurants as needed. Neither rooms, table counts, venue capacities, nor prices are invented or enabled automatically.

### Dining workflow

1. Guests choose a restaurant, date, party size and Couple/Family/Group. The server returns seating slots that have suitable physical tables.
2. Guests review the complete prepaid amount, inclusions and policies, then submit contact details and requests. Save the private booking link shown after submission.
3. The request is **pending_payment** and holds its assigned tables for the configured period. A full verified payment is required before confirmation.
4. Payment gateways are intentionally not integrated. Staff must arrange payment outside this website, independently verify actual receipt, and record the amount plus a unique external receipt/reference in admin. The admin form does not collect or process money.
5. Full payment automatically marks the booking **confirmed**. Staff may then mark **seated**, **completed**, or **no_show** at the appropriate time.

Unpaid holds expire and release tables. Partially paid holds enter **payment_review** after expiry and keep inventory reserved for staff review; partial payments never silently become confirmed or disappear. Staff can record the verified balance to complete confirmation. Fully paid dining holds never expire.

### Event workflow

1. Guests select venue, date/time, layout, headcount and event type; add catering, dietary, decor, equipment and other requirements.
2. The system validates capacity and current availability, then creates a **requested** enquiry. Enquiries do not hold venues.
3. Admin issues a full-amount quote with inclusions and terms. A **quoted** status exclusively holds the venue for the configured period, including setup/teardown buffers.
4. The guest reviews and accepts the exact quote through the private booking link. The reservation becomes **pending_payment**.
5. Staff arrange and verify external payment, then record receipt(s). Only full payment confirms the event. Admin may later mark **in_progress** and **completed**.

Competing quotes cannot double-book the same venue. Expired quotes may be reissued only if availability still permits. Requoting requires fresh guest acceptance. Quotes cannot be revised after payment has been received. Admin may decline an unpaid enquiry or unaccepted quote.

Online cancellation/refunds are intentionally not implemented, following the user's request to leave cancellation for later. There is no gateway, automated receipt email/SMS, payment collection, or refund processing. Record real payments only; do not mark a booking paid merely because a guest says they paid. This manual verification workflow is temporary until the requested online-payment integration is added.

### Guest access and controls

Private manage links use a high-entropy token in the URL fragment, not query parameters. The API requires the token as a Bearer credential and stores a hash for comparison. A reference by itself cannot retrieve guest data. Keep private links confidential. Admin operations use the existing protected admin session. Reservation creation is transactional, rate limited and idempotent. Guest-acknowledged policies, quote acceptance, staff actions and payment receipts are snapshotted/audited. Existing reservations retain their agreed package amount and policies after settings change.

### Additional APIs

All routes below start with `/api`. Money is integer paise.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/hospitality/resources?kind=dining` or `events` | Published restaurants/venues and guest policies |
| GET | `/hospitality/dining/availability?resourceId=...&date=YYYY-MM-DD&guests=2` | Available seating slots with totals |
| GET | `/hospitality/events/availability?resourceId=...&date=YYYY-MM-DD&time=18:00&endTime=20:00&guests=50&layout=Banquet` | Venue and buffer availability |
| POST | `/hospitality/dining/reservations` | Dining request; requires `Idempotency-Key` |
| POST | `/hospitality/events/reservations` | Event enquiry; requires `Idempotency-Key` |
| GET | `/hospitality/reservations/:reference` | Guest status; requires Bearer manage token |
| POST | `/hospitality/reservations/:id/accept` | Accept exact current event quote with token |
| GET/POST | `/admin/hospitality/resources` | List all resources / create one |
| PUT | `/admin/hospitality/resources/:id` | Update resource configuration |
| GET | `/admin/hospitality/reservations?kind=&status=&search=&page=1` | Paginated reservations and details |
| POST | `/admin/hospitality/reservations/:id/quote` | Issue event quote: `{total,terms}` |
| POST | `/admin/hospitality/reservations/:id/payments` | Record externally verified receipt: `{amount,receipt}` |
| PATCH | `/admin/hospitality/reservations/:id` | Allowed operational status transition |

Guest requests include `resourceId`, the current `revision`, `date`, `time`, `guests`, `name`, `email`, `phone`, `notes`, and `acceptPolicies:true`. Dining also sends `partyType` and `expectedTotal`; events send `endTime`, `layout`, and `eventType`. Quote acceptance sends `{acceptQuote:true,expectedTotal,issuedAt}` matching the displayed quote.

### Policy references

The workflows draw on published hospitality practices, not a universal luxury-hotel rulebook:

- [Taj Sea Lounge](https://www.tajhotels.com/en-in/hotels/taj-mahal-tower-mumbai/restaurants/sea-lounge-mumbai): service periods, advance reservations, and restaurant-specific dress codes.
- [Pittsburgh Airport Marriott event menu](https://www.marriott.com/content/dam/marriott-digital/mc/us-canada/hws/p/pitmc/en_us/document/assets/mc-pitmc-2-23-event-menu-25387.pdf): event pricing/inclusions and deposit-based reservation requirements. Pratap Palace's full-payment-before-confirmation rule is the user's own choice.


## Dining status without login

Dining hero → **My booking** opens `/dining/status`. Guests enter their exact booking reference, email and phone (including the original country code) to see current status and reservation time. `POST /api/hospitality/dining/status` requires `{reference,email,phone}`; all three must match. The endpoint is limited to 10 attempts per IP per 15 minutes and returns only a status summary, not contact details, requests, payment receipts, or a private management token. Full private-link management still works separately. No customer login/accounts were added.

## Guest notifications

The backend queues room confirmations after staff confirm a stay, dining and event confirmations after full verified payment, event quotes when issued, and reminders before active dining and event holds expire. Guest notifications in admin shows status by booking reference and department. Provider acceptance is shown separately from delivery. For email, “Delivered” means delivery to the recipient's mail server.

Set `NOTIFICATION_PUBLIC_ORIGIN` to the public HTTPS origin used by guests. Configure either channel or both in `server/.env` or the hosting environment and restart the backend. Keep credentials on the server.

- **Email (Resend).** Set `RESEND_API_KEY`, `NOTIFICATION_FROM` with a verified sender, and `RESEND_WEBHOOK_SECRET`. Point Resend's webhook to `/api/webhooks/notifications/email`. Subscribe to sent, delivered, delivery-delayed, bounced, complained, failed, and suppressed email events.
- **WhatsApp (Meta Cloud API).** Set the access token, phone number ID, Graph API version, app secret, webhook verification token, and three approved utility template names shown in `.env.example`. Subscribe the WhatsApp Business Account to the `messages` webhook at `/api/webhooks/notifications/whatsapp`. Each template must have exactly three positional body variables, in this order: booking reference, reservation details, and booking URL. Use the approved template language in `WHATSAPP_TEMPLATE_LANGUAGE`. For example, a template can read “Pratap Palace booking {{1}}. {{2}} Details: {{3}}. Reply STOP to stop WhatsApp updates.” Guests opt in when booking using a phone number with country code. Only the chosen channel is used. STOP or UNSUBSCRIBE stops updates for the bookings tied to that number.

The app records unconfigured notifications as “Not configured.” Enabling a provider starts delivery for new eligible events. The worker retries temporary email failures and explicit rate limits while the message is still relevant. An ambiguous WhatsApp send is marked “Delivery unknown” to avoid duplicate messages. Booking and payment actions complete independently of provider availability.
