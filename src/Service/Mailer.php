<?php

declare(strict_types=1);

namespace Essensplan\Service;

use Essensplan\Config;
use PHPMailer\PHPMailer\PHPMailer;

/**
 * Plain-text mail. MAIL_DRIVER=log (default) appends to storage/mail.log;
 * MAIL_DRIVER=smtp sends via PHPMailer (Mailpit locally, all-inkl SMTP live).
 */
class Mailer
{
    /** @var list<array{to: string, subject: string, body: string}> the last mails, for tests */
    public array $sent = [];

    public function __construct(private readonly Config $config, private readonly string $logFile)
    {
    }

    public function send(string $to, string $subject, string $body): void
    {
        $this->sent[] = ['to' => $to, 'subject' => $subject, 'body' => $body];
        $driver = $this->config->get('MAIL_DRIVER', 'log');
        if ($driver === 'smtp') {
            $this->smtp($to, $subject, $body);
            return;
        }
        if ($driver === 'log') {
            @mkdir(dirname($this->logFile), 0775, true);
            file_put_contents(
                $this->logFile,
                sprintf("--- %s\nTo: %s\nSubject: %s\n\n%s\n\n", gmdate(DATE_ATOM), $to, $subject, $body),
                FILE_APPEND | LOCK_EX,
            );
        }
        // MAIL_DRIVER=array: keep in memory only (tests)
    }

    private function smtp(string $to, string $subject, string $body): void
    {
        $m = new PHPMailer(true);
        $m->isSMTP();
        $m->Host = $this->config->get('MAIL_HOST', '127.0.0.1');
        $m->Port = $this->config->int('MAIL_PORT', 1025);
        $user = $this->config->get('MAIL_USER');
        if ($user !== '') {
            $m->SMTPAuth = true;
            $m->Username = $user;
            $m->Password = $this->config->get('MAIL_PASS');
            $m->SMTPSecure = $this->config->get('MAIL_ENCRYPTION', PHPMailer::ENCRYPTION_STARTTLS);
        } else {
            $m->SMTPAutoTLS = false;
        }
        $m->CharSet = PHPMailer::CHARSET_UTF8;
        $m->setFrom($this->config->get('MAIL_FROM', 'essensplan@localhost'), 'Essensplan');
        $m->addAddress($to);
        $m->Subject = $subject;
        $m->Body = $body;
        $m->send();
    }
}
