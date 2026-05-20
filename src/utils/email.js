import emailjs from "@emailjs/browser";

const PUBLIC_KEY = process.env.REACT_APP_EMAILJS_PUBLIC_KEY;
const SERVICE_ID = process.env.REACT_APP_EMAILJS_SERVICE_ID;
const CONTACT_TEMPLATE_ID = process.env.REACT_APP_EMAILJS_CONTACT_TEMPLATE_ID;
const WELCOME_TEMPLATE_ID = process.env.REACT_APP_EMAILJS_WELCOME_TEMPLATE_ID;
const BOOKING_TEMPLATE_ID = process.env.REACT_APP_EMAILJS_BOOKING_TEMPLATE_ID;
export const CONTACT_RECIPIENT = "arshr076@gmail.com";

function canSend(templateId) {
  return Boolean(PUBLIC_KEY && SERVICE_ID && templateId);
}

async function sendTemplate(templateId, params) {
  if (!canSend(templateId)) {
    throw new Error("Email delivery is currently unavailable.");
  }

  return emailjs.send(SERVICE_ID, templateId, params, {
    publicKey: PUBLIC_KEY,
  });
}

export async function sendContactEmail({ firstName, lastName, email, message }) {
  return sendTemplate(CONTACT_TEMPLATE_ID, {
    first_name: firstName,
    last_name: lastName,
    from_name: `${firstName} ${lastName}`.trim(),
    reply_to: CONTACT_RECIPIENT,
    email: CONTACT_RECIPIENT,
    to_email: email,
    visitor_email: email,
    admin_email: CONTACT_RECIPIENT,
    message,
  });
}

export async function sendWelcomeEmail({ name, email, provider }) {
  return sendTemplate(WELCOME_TEMPLATE_ID, {
    to_name: name || "Traveler",
    to_email: email,
    provider: provider || "email",
    message: `Welcome to Trip Planner. Your ${provider || "email"} registration is confirmed.`,
  });
}

export async function sendBookingConfirmationEmail({ booking, email, name }) {
  return sendTemplate(BOOKING_TEMPLATE_ID, {
    to_name: name || "Traveler",
    to_email: email,
    booking_reference: booking.bookingReference,
    hotel_name: booking.hotelName,
    destination: booking.destination,
    check_in_date: booking.checkInDate,
    check_out_date: booking.checkOutDate,
    guests: booking.guests,
    total_price: booking.totalPrice,
    payment_method: booking.paymentMethod,
    payment_status: booking.paymentStatus,
    booking_status: booking.bookingStatus,
    transaction_id: booking.paymentTransactionId || booking.cryptoTxHash || "",
  });
}

export function isEmailServiceConfigured() {
  return Boolean(PUBLIC_KEY && SERVICE_ID && CONTACT_TEMPLATE_ID);
}

export function isWelcomeEmailConfigured() {
  return Boolean(PUBLIC_KEY && SERVICE_ID && WELCOME_TEMPLATE_ID);
}

export function isBookingEmailConfigured() {
  return Boolean(PUBLIC_KEY && SERVICE_ID && BOOKING_TEMPLATE_ID);
}
