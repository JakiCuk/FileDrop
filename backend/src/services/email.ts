import nodemailer from "nodemailer";
import { ConfidentialClientApplication } from "@azure/msal-node";
import { config } from "../config";
import {
  getEmailLocale,
  getEmailTranslations,
  getDateLocale,
  type EmailLocale,
} from "../locales/email";

let transporter: nodemailer.Transporter | null = null;
let msalClient: ConfidentialClientApplication | null = null;

function getMsalClient(): ConfidentialClientApplication {
  if (msalClient) return msalClient;

  msalClient = new ConfidentialClientApplication({
    auth: {
      clientId: config.smtp.oauth2ClientId,
      authority: `https://login.microsoftonline.com/${config.smtp.oauth2TenantId}`,
      clientSecret: config.smtp.oauth2ClientSecret,
    },
  });

  return msalClient;
}

async function getOAuth2AccessToken(): Promise<string> {
  const client = getMsalClient();
  const result = await client.acquireTokenByClientCredential({
    scopes: ["https://outlook.office365.com/.default"],
  });

  if (!result?.accessToken) {
    throw new Error("Failed to acquire OAuth2 access token from Azure AD");
  }

  return result.accessToken;
}

async function createOAuth2Transport(): Promise<nodemailer.Transporter> {
  const accessToken = await getOAuth2AccessToken();

  return nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.port === 465,
    auth: {
      type: "OAuth2",
      user: config.smtp.from,
      accessToken,
    },
  });
}

function createSmtpTransport(): nodemailer.Transporter {
  return nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.port === 465,
    auth: {
      user: config.smtp.user,
      pass: config.smtp.pass,
    },
    tls: {
      rejectUnauthorized: config.smtp.tlsRejectUnauthorized,
    },
  });
}

function createNoneTransport(): nodemailer.Transporter {
  return nodemailer.createTransport({ jsonTransport: true });
}

export async function getTransporter(): Promise<nodemailer.Transporter> {
  if (config.smtp.mode === "oauth2") {
    // OAuth2 tokens expire — always create a fresh transport to ensure valid token
    return createOAuth2Transport();
  }

  if (transporter) return transporter;

  if (config.smtp.mode === "smtp") {
    transporter = createSmtpTransport();
  } else {
    console.warn("SMTP_MODE=none — OTP codes will be logged to console only");
    transporter = createNoneTransport();
  }

  return transporter;
}

export async function sendReplyNotification(
  ownerEmail: string,
  shareUrl: string,
  expiresAt: Date | null,
  locale?: string,
): Promise<void> {
  const t = await getTransporter();
  const loc: EmailLocale = getEmailLocale(locale);
  const L = getEmailTranslations(loc);
  const dateStr = expiresAt?.toLocaleDateString(getDateLocale(loc)) ?? "";
  const expiryText = expiresAt ? L.reply.linkValidity(dateStr) : L.reply.noExpiry;

  const mailOptions = {
    from: config.smtp.fromFormatted,
    to: ownerEmail,
    subject: L.reply.subject,
    text: `${L.reply.intro}\n\n${L.reply.downloadBtn}: ${shareUrl}\n\n${expiryText}`,
    html: `
      <div style="font-family: Calibri, sans-serif; max-width: 480px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #2b6e33;">${config.appName}</h2>
        <p>${L.reply.intro}</p>
        <div style="margin: 24px 0;">
          <a href="${shareUrl}"
             style="display: inline-block; background: #2b6e33; color: #fff; padding: 12px 24px;
                    border-radius: 8px; text-decoration: none; font-weight: bold;">
            ${L.reply.downloadBtn}
          </a>
        </div>
        <p style="color: #666; font-size: 14px;">${expiryText}</p>
        <p style="color: #999; font-size: 12px; margin-top: 24px;">
          ${L.reply.keyWarning}
        </p>
      </div>
    `,
  };

  const info = await t.sendMail(mailOptions);

  if (config.smtp.mode === "none") {
    console.log(`[Reply] Notification for ${ownerEmail}: ${shareUrl}`);
  } else {
    console.log(`[Reply] Email sent to ${ownerEmail} via ${config.smtp.mode}, messageId: ${info.messageId}`);
  }
}

export async function sendOtpEmail(
  email: string,
  code: string,
  locale?: string,
): Promise<void> {
  const t = await getTransporter();
  const loc: EmailLocale = getEmailLocale(locale);
  const L = getEmailTranslations(loc);
  const mins = config.otpExpiryMinutes;

  const mailOptions = {
    from: config.smtp.fromFormatted,
    to: email,
    subject: L.otp.subject,
    text: `${L.otp.intro}\n\n${code}\n\n${L.otp.validity}: ${mins} min.\n${L.otp.ignore}`,
    html: `
      <div style="font-family: Calibri, sans-serif; max-width: 400px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #2b6e33;">${config.appName}</h2>
        <p>${L.otp.intro}</p>
        <div style="background: #f0f0f0; padding: 16px; border-radius: 8px; text-align: center; font-size: 32px; letter-spacing: 8px; font-weight: bold; color: #595a5b;">
          ${code}
        </div>
        <p style="color: #666; font-size: 14px; margin-top: 16px;">
          ${L.otp.validity}: ${mins} min.<br/>
          ${L.otp.ignore}
        </p>
      </div>
    `,
  };

  const info = await t.sendMail(mailOptions);

  if (config.smtp.mode === "none") {
    console.log(`[OTP] Code for ${email}: ${code}`);
  } else {
    console.log(`[OTP] Email sent to ${email} via ${config.smtp.mode}, messageId: ${info.messageId}`);
  }
}
