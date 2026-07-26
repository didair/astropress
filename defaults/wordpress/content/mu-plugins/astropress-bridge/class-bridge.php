<?php

final class AstroPress_Bridge
{
    public static function boot(): void
    {
        add_filter('pre_option_template', [AstroPress_Bridge_Theme::class, 'forceTheme']);
        add_filter('pre_option_stylesheet', [AstroPress_Bridge_Theme::class, 'forceTheme']);
        add_filter('pre_option_current_theme', fn (): string => 'AstroPress');

        add_filter('got_url_rewrite', '__return_true');
        add_filter('got_rewrite', '__return_true');

        add_action('after_setup_theme', [AstroPress_Bridge_Theme::class, 'registerNavMenus'], 5);
        add_action('admin_init', [self::class, 'normalizePermalinks']);
        add_action('init', [AstroPress_Bridge_Internal::class, 'handleInternalRequests'], 0);
        add_action('init', [AstroPress_Bridge_Assets::class, 'registerBundledBlocks'], 20);
        add_action('enqueue_block_assets', [AstroPress_Bridge_Assets::class, 'enqueueBlockAssets']);
        add_action('enqueue_block_editor_assets', [AstroPress_Bridge_Assets::class, 'enqueueBlockAssets'], 20);
        add_action('admin_enqueue_scripts', [AstroPress_Bridge_Assets::class, 'enqueueBlockAssets'], 20);
        add_action('wp_enqueue_scripts', [AstroPress_Bridge_Assets::class, 'enqueuePluginAssets']);
        add_action('admin_enqueue_scripts', [AstroPress_Bridge_Assets::class, 'enqueuePluginAssets']);
        add_action('rest_api_init', [AstroPress_Bridge_Rest::class, 'registerRoutes']);
    }

    public static function normalizePermalinks(): void
    {
        $structure = (string) get_option('permalink_structure');

        if (str_starts_with($structure, '/index.php/')) {
            update_option('permalink_structure', substr($structure, strlen('/index.php')));
            flush_rewrite_rules(false);
        }
    }
}
