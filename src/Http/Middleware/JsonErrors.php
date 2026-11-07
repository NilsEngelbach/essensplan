<?php

declare(strict_types=1);

namespace Essensplan\Http\Middleware;

use Essensplan\Config;
use Essensplan\Http\ApiError;
use Essensplan\Http\Io;
use Psr\Http\Message\ResponseFactoryInterface;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface as Handler;
use Slim\Exception\HttpMethodNotAllowedException;
use Slim\Exception\HttpNotFoundException;

/** Every error leaves as {"error":{"code","message"}}. */
final class JsonErrors implements MiddlewareInterface
{
    public function __construct(private readonly ResponseFactoryInterface $factory, private readonly Config $config)
    {
    }

    public function process(Request $req, Handler $handler): Response
    {
        try {
            return $handler->handle($req);
        } catch (ApiError $e) {
            $body = ['code' => $e->errorCode, 'message' => $e->getMessage()];
            if ($e->details) {
                $body['details'] = $e->details;
            }
            $res = Io::json($this->factory->createResponse(), ['error' => $body], $e->status);
            foreach ($e->headers as $k => $v) {
                $res = $res->withHeader($k, $v);
            }
            return $res;
        } catch (HttpNotFoundException) {
            return Io::json($this->factory->createResponse(), ['error' => ['code' => 'not_found', 'message' => 'Diese Adresse gibt es nicht.']], 404);
        } catch (HttpMethodNotAllowedException $e) {
            return Io::json($this->factory->createResponse(), ['error' => ['code' => 'method_not_allowed', 'message' => 'Diese Methode geht hier nicht.']], 405)
                ->withHeader('Allow', implode(', ', $e->getAllowedMethods()));
        } catch (\Throwable $e) {
            error_log('[essensplan] ' . $e::class . ': ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
            $body = ['code' => 'server_error', 'message' => 'Da ist etwas schiefgelaufen. Versuch es gleich noch einmal.'];
            if ($this->config->isDebug()) {
                $body['debug'] = $e::class . ': ' . $e->getMessage() . ' @ ' . basename($e->getFile()) . ':' . $e->getLine();
            }
            return Io::json($this->factory->createResponse(), ['error' => $body], 500);
        }
    }
}
