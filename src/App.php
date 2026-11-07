<?php

declare(strict_types=1);

namespace Essensplan;

use DI\ContainerBuilder;
use Essensplan\Http\Controller\McpController;
use Essensplan\Http\Controller\SpaController;
use Essensplan\Http\Middleware\Authenticate;
use Essensplan\Http\Middleware\Csrf;
use Essensplan\Http\Middleware\JsonErrors;
use Essensplan\Http\Middleware\RateLimit;
use Essensplan\Http\Middleware\RequireScope;
use Essensplan\Http\Routes;
use Essensplan\Service\Mailer;
use Psr\Container\ContainerInterface;
use Psr\Http\Message\ResponseFactoryInterface;
use Slim\App as SlimApp;
use Slim\Factory\AppFactory;
use Slim\Psr7\Factory\ResponseFactory;
use Slim\Routing\RouteCollectorProxy;

/** Builds the container and the Slim app: /api/v1 (REST), /mcp, and the SPA for everything else. */
final class App
{
    public static function root(): string
    {
        return dirname(__DIR__);
    }

    /** @param array<string, mixed> $overrides container entries to replace (tests) */
    public static function container(?Config $config = null, array $overrides = []): ContainerInterface
    {
        $config ??= Config::load(self::root());
        $builder = new ContainerBuilder();
        $builder->useAutowiring(true);
        $builder->addDefinitions([
            Config::class => $config,
            Db::class => fn () => Db::connect($config),
            Clock::class => fn () => new Clock(),
            Mailer::class => fn () => new Mailer($config, self::root() . '/storage/mail.log'),
            ResponseFactoryInterface::class => fn () => new ResponseFactory(),
            SpaController::class => fn () => new SpaController(self::root() . '/public/app'),
            ...$overrides,
        ]);
        return $builder->build();
    }

    public static function create(?ContainerInterface $container = null): SlimApp
    {
        $container ??= self::container();
        AppFactory::setContainer($container);
        $app = AppFactory::create();

        $app->group('/api/v1', function (RouteCollectorProxy $group) {
            foreach (Routes::all() as [$method, $path, $handler]) {
                $group->map([$method], $path, $handler)->setName(Routes::name($method, $path));
            }
        });
        $app->post('/mcp', [McpController::class, 'post'])->setName('mcp post');
        $app->map(['GET', 'DELETE', 'PUT', 'PATCH'], '/mcp', [McpController::class, 'other'])->setName('spa mcp-other');
        $app->get('/{path:.*}', SpaController::class)->setName('spa');

        // Slim runs the last added first: JsonErrors → routing → RateLimit → Authenticate → RequireScope → Csrf.
        $app->add(Csrf::class);
        $app->add(RequireScope::class);
        $app->add(Authenticate::class);
        $app->add(RateLimit::class);
        $app->addRoutingMiddleware();
        $app->add(JsonErrors::class);
        return $app;
    }
}
