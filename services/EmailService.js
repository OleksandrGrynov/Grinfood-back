const sgMail = require('@sendgrid/mail');

class EmailService {
    constructor() {
        sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    }

    async sendResetEmail(email, resetLink) {
        const msg = {
            to: email,
            from: process.env.SENDGRID_FROM_EMAIL,
            subject: '🔐 Скидання пароля до GrinFood',
            html: `
                <p>Вітаємо!</p>
                <p>Щоб скинути пароль, натисніть кнопку нижче:</p>
                <a href="${resetLink}" style="background:#4CAF50;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;">
                    Скинути пароль
                </a>
                <p>Якщо ви не запитували скидання — просто ігноруйте цей лист.</p>
                <br />
                <small>GrinFood Team</small>
            `,
        };

        await sgMail.send(msg);
    }

    async sendProfileUpdatedEmail(email, name) {
        const msg = {
            to: email,
            from: process.env.SENDGRID_FROM_EMAIL,
            subject: '✅ Ваш профіль GrinFood оновлено',
            html: `
                <p>Привіт, <strong>${name}</strong>!</p>
                <p>Ваш профіль був успішно оновлений.</p>
                <p>Якщо це були не ви — терміново змініть пароль.</p>
                <br />
                <small>З повагою, команда GrinFood</small>
            `
        };

        await sgMail.send(msg);
    }

    async sendVerificationEmail(email, link) {
        const msg = {
            to: email,
            from: process.env.SENDGRID_FROM_EMAIL,
            subject: '🔐 Підтвердження пошти GrinFood',
            html: `
                <p>Привіт!</p>
                <p>Щоб підтвердити вашу пошту, натисніть кнопку нижче:</p>
                <a href="${link}" style="background:#4CAF50;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;">
                    Підтвердити пошту
                </a>
                <p>Якщо це були не ви — проігноруйте це повідомлення.</p>
            `
        };

        await sgMail.send(msg);
    }
}

module.exports = EmailService;
