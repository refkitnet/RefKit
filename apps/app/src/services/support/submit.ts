import { AppError } from "@/lib/errors";
import {
  getSupportRequestTypeLabel,
  isSupportRequestType,
} from "@/lib/support-request";
import { sendSupportRequestEmailDirect } from "@/services/emails/send-support-request";

const MAX_MESSAGE_LENGTH = 5000;
const MAX_ATTACHMENT_SIZE_BYTES = 1024 * 1024;

const ATTACHMENT_EXTENSIONS = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

function hasExpectedSignature(contentType: string, bytes: Uint8Array) {
  if (contentType === "image/png") {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return signature.every((value, index) => bytes[index] === value);
  }

  if (contentType === "image/jpeg") {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }

  if (contentType === "image/webp") {
    return (
      String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
    );
  }

  return false;
}

async function validateAttachment(file: File) {
  const extension = ATTACHMENT_EXTENSIONS.get(file.type);

  if (!extension) {
    throw new AppError(
      "invalid_request",
      "invalid_support_attachment_type",
      "Attachment must be a PNG, JPEG, or WebP image.",
      400
    );
  }

  if (file.size === 0 || file.size > MAX_ATTACHMENT_SIZE_BYTES) {
    throw new AppError(
      "invalid_request",
      "invalid_support_attachment_size",
      "Attachment must be smaller than 1 MB.",
      400
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());

  if (!hasExpectedSignature(file.type, bytes)) {
    throw new AppError(
      "invalid_request",
      "invalid_support_attachment_file",
      "Attachment file contents do not match its image type.",
      400
    );
  }

  const safeName = file.name.replace(/[^\w.-]+/g, "_").slice(0, 120);
  const filename = safeName.includes(".")
    ? safeName
    : `${safeName || "attachment"}.${extension}`;

  return {
    filename,
    content: Buffer.from(bytes).toString("base64"),
  };
}

export async function submitSupportRequest(input: {
  userId: string;
  userEmail: string | null;
  userName: string | null;
  type: string;
  message: string;
  attachment?: File | null;
}) {
  if (!input.userEmail) {
    throw new AppError(
      "invalid_request",
      "support_email_required",
      "Your account needs an email address before contacting support.",
      400
    );
  }

  const message = input.message.trim();

  if (!isSupportRequestType(input.type)) {
    throw new AppError(
      "invalid_request",
      "invalid_support_request_type",
      "Choose a support topic.",
      400
    );
  }

  const type = input.type;

  if (!message) {
    throw new AppError(
      "invalid_request",
      "support_message_required",
      "Tell us what you need help with.",
      400
    );
  }

  if (message.length > MAX_MESSAGE_LENGTH) {
    throw new AppError(
      "invalid_request",
      "support_message_too_long",
      `Message must be ${MAX_MESSAGE_LENGTH} characters or fewer.`,
      400
    );
  }

  const attachment =
    input.attachment instanceof File
      ? await validateAttachment(input.attachment)
      : null;

  await sendSupportRequestEmailDirect({
    userId: input.userId,
    userEmail: input.userEmail,
    userName: input.userName,
    type,
    typeLabel: getSupportRequestTypeLabel(type),
    message,
    attachment,
  });
}
