<?php

final class AstroPress_Bridge_Rest
{
    public static function registerRoutes(): void
    {
        register_rest_route('astropress/v1', '/routing', [
            'methods' => WP_REST_Server::READABLE,
            'permission_callback' => '__return_true',
            'callback' => function () {
                $page_on_front = (int) get_option('page_on_front');
                $page_for_posts = (int) get_option('page_for_posts');

                return [
                    'show_on_front' => get_option('show_on_front'),
                    'page_on_front' => $page_on_front,
                    'page_for_posts' => $page_for_posts,
                    'front_page' => AstroPress_Bridge_Content::pageSummary($page_on_front),
                    'posts_page' => AstroPress_Bridge_Content::pageSummary($page_for_posts),
                ];
            },
        ]);

        register_rest_route('astropress/v1', '/health', [
            'methods' => WP_REST_Server::READABLE,
            'permission_callback' => '__return_true',
            'callback' => function () {
                return [
                    'wordpressVersion' => get_bloginfo('version'),
                    'phpVersion' => PHP_VERSION,
                    'homeUrl' => home_url('/'),
                    'siteUrl' => site_url('/'),
                    'permalinkStructure' => (string) get_option('permalink_structure'),
                    'activeTheme' => get_stylesheet(),
                    'template' => get_template(),
                    'activePlugins' => array_values((array) get_option('active_plugins', [])),
                    'muPlugins' => array_values(array_keys(get_mu_plugins())),
                ];
            },
        ]);

        register_rest_route('astropress/v1', '/types', [
            'methods' => WP_REST_Server::READABLE,
            'permission_callback' => '__return_true',
            'callback' => function () {
                return [
                    'postTypes' => AstroPress_Bridge_Content::postTypes(),
                    'taxonomies' => AstroPress_Bridge_Content::taxonomies(),
                ];
            },
        ]);

        register_rest_route('astropress/v1', '/blocks', [
            'methods' => WP_REST_Server::READABLE,
            'permission_callback' => '__return_true',
            'callback' => [AstroPress_Bridge_Assets::class, 'blocks'],
        ]);

        register_rest_route('astropress/v1', '/menus', [
            'methods' => WP_REST_Server::READABLE,
            'permission_callback' => '__return_true',
            'callback' => [AstroPress_Bridge_Content::class, 'menus'],
        ]);

        register_rest_route('astropress/v1', '/post', [
            'methods' => WP_REST_Server::READABLE,
            'permission_callback' => '__return_true',
            'args' => [
                'id' => [
                    'type' => 'integer',
                    'required' => true,
                ],
            ],
            'callback' => function (WP_REST_Request $request) {
                $post = get_post((int) $request->get_param('id'));

                if (! $post) {
                    return new WP_REST_Response(['message' => 'Post not found'], 404);
                }

                return AstroPress_Bridge_Content::postItem($post);
            },
        ]);

        register_rest_route('astropress/v1', '/resolve', [
            'methods' => WP_REST_Server::READABLE,
            'permission_callback' => '__return_true',
            'args' => [
                'path' => [
                    'type' => 'string',
                    'required' => true,
                ],
            ],
            'callback' => fn (WP_REST_Request $request) => AstroPress_Bridge_Content::resolvePath((string) $request->get_param('path')),
        ]);

        register_rest_route('astropress/v1', '/archive', [
            'methods' => WP_REST_Server::READABLE,
            'permission_callback' => '__return_true',
            'callback' => fn (WP_REST_Request $request) => AstroPress_Bridge_Content::archive($request),
        ]);
    }
}
