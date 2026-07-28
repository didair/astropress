<?php

final class AstroPress_Bridge_Content
{
    public static function postTypes(): array
    {

        $post_types = get_post_types(['public' => true, 'show_in_rest' => true], 'objects');
        $items = [];

        foreach ($post_types as $post_type) {
            $items[] = [
                'name' => $post_type->name,
                'restBase' => AstroPress_Bridge_Content::restBase($post_type),
                'archive' => (bool) $post_type->has_archive,
                'archiveSlug' => $post_type->has_archive ? AstroPress_Bridge_Content::archive_slug($post_type) : null,
                'label' => $post_type->label,
                'singularLabel' => $post_type->labels->singular_name,
                'taxonomies' => array_values(get_object_taxonomies($post_type->name)),
                'supports' => get_all_post_type_supports($post_type->name),
            ];
        }

        return $items;
    }

    public static function taxonomies(): array
    {

        $taxonomies = get_taxonomies(['public' => true, 'show_in_rest' => true], 'objects');
        $items = [];

        foreach ($taxonomies as $taxonomy) {
            $items[] = [
                'name' => $taxonomy->name,
                'restBase' => $taxonomy->rest_base ?: $taxonomy->name,
                'label' => $taxonomy->label,
                'objectTypes' => array_values($taxonomy->object_type),
                'hierarchical' => (bool) $taxonomy->hierarchical,
            ];
        }

        return $items;
    }

    public static function pageSummary(int $page_id): ?array
    {

        if ($page_id <= 0) {
            return null;
        }

        $page = get_post($page_id);

        if (! $page || $page->post_type !== 'page') {
            return null;
        }

        return [
            'id' => $page->ID,
            'slug' => $page->post_name,
            'title' => get_the_title($page),
            'link' => get_permalink($page),
        ];
    }

    public static function resolvePath(string $input): WP_REST_Response
    {

        $parts = parse_url($input);
        $query = [];
        parse_str($parts['query'] ?? '', $query);

        $path = '/' . trim($parts['path'] ?? '/', '/');
        [$path, $page] = AstroPress_Bridge_Content::stripPagination($path);
        $trimmed_path = trim($path, '/');

        $search = AstroPress_Bridge_Content::searchQuery($trimmed_path, $query);
        if ($search !== null) {
            return new WP_REST_Response([
                'found' => true,
                'kind' => 'search',
                'slug' => $trimmed_path,
                'postType' => 'post',
                'restBase' => 'posts',
                'title' => sprintf(__('Search results for “%s”'), $search),
                'search' => $search,
                'page' => $page,
            ]);
        }

        if ($path === '/') {
            return AstroPress_Bridge_Content::resolveHome($page);
        }

        $post_id = url_to_postid(home_url($path));

        if ($post_id > 0) {
            $post = get_post($post_id);

            if ($post) {
                $post_type = get_post_type_object($post->post_type);

                return new WP_REST_Response([
                    'found' => true,
                    'kind' => $post->post_type === 'page' ? 'page' : 'single',
                    'id' => $post->ID,
                    'slug' => $post->post_name,
                    'postType' => $post->post_type,
                    'restBase' => AstroPress_Bridge_Content::restBase($post_type),
                    'isFrontPage' => false,
                    'isPostsPage' => (int) get_option('page_for_posts') === $post->ID,
                ]);
            }
        }

        $single = AstroPress_Bridge_Content::resolveSingleBySlug($path);

        if ($single) {
            return new WP_REST_Response($single);
        }

        $taxonomy = AstroPress_Bridge_Content::resolveTaxonomyArchive($path, $page);

        if ($taxonomy) {
            return new WP_REST_Response($taxonomy);
        }

        $archive = AstroPress_Bridge_Content::resolvePostTypeArchive($path, $page);

        if ($archive) {
            return new WP_REST_Response($archive);
        }

        return new WP_REST_Response([
            'found' => false,
            'kind' => 'notFound',
        ], 404);
    }

    public static function resolveHome(int $page): WP_REST_Response
    {

        if (get_option('show_on_front') === 'page') {
            $front_page_id = (int) get_option('page_on_front');
            $front_page = get_post($front_page_id);

            if ($front_page && $page <= 1) {
                return new WP_REST_Response([
                    'found' => true,
                    'kind' => 'page',
                    'id' => $front_page->ID,
                    'slug' => $front_page->post_name,
                    'postType' => 'page',
                    'restBase' => 'pages',
                    'isFrontPage' => true,
                    'isPostsPage' => false,
                ]);
            }
        }

        return new WP_REST_Response([
            'found' => true,
            'kind' => 'postsArchive',
            'slug' => '',
            'postType' => 'post',
            'restBase' => 'posts',
            'title' => AstroPress_Bridge_Content::postsArchiveTitle(),
            'page' => $page,
        ]);
    }

    public static function resolveSingleBySlug(string $path): ?array
    {

        $slug = basename(trim($path, '/'));

        if ($slug === '') {
            return null;
        }

        $post_types = array_values(get_post_types(['public' => true], 'names'));

        $query = new WP_Query([
            'name' => $slug,
            'post_type' => $post_types,
            'post_status' => 'publish',
            'posts_per_page' => 1,
            'no_found_rows' => true,
        ]);

        if (! $query->have_posts()) {
            return null;
        }

        $post = $query->posts[0];
        $post_type = get_post_type_object($post->post_type);

        return [
            'found' => true,
            'kind' => $post->post_type === 'page' ? 'page' : 'single',
            'id' => $post->ID,
            'slug' => $post->post_name,
            'postType' => $post->post_type,
            'restBase' => AstroPress_Bridge_Content::restBase($post_type),
            'isFrontPage' => (int) get_option('page_on_front') === $post->ID,
            'isPostsPage' => (int) get_option('page_for_posts') === $post->ID,
        ];
    }

    public static function resolvePostTypeArchive(string $path, int $page): ?array
    {

        $trimmed_path = trim($path, '/');

        if ($trimmed_path === '') {
            return null;
        }

        $page_for_posts = (int) get_option('page_for_posts');

        if ($page_for_posts > 0) {
            $posts_page = get_post($page_for_posts);

            if ($posts_page && $trimmed_path === $posts_page->post_name) {
                return [
                    'found' => true,
                    'kind' => 'postsArchive',
                    'slug' => $posts_page->post_name,
                    'postType' => 'post',
                    'restBase' => 'posts',
                    'title' => get_the_title($posts_page),
                    'page' => $page,
                ];
            }
        }

        $post_types = get_post_types(['public' => true], 'objects');

        foreach ($post_types as $post_type) {
            if ($post_type->name === 'post' || $post_type->name === 'page') {
                continue;
            }

            if (! $post_type->has_archive) {
                continue;
            }

            $archive_slug = AstroPress_Bridge_Content::archive_slug($post_type);

            if ($trimmed_path === $archive_slug) {
                return [
                    'found' => true,
                    'kind' => 'postTypeArchive',
                    'slug' => $archive_slug,
                    'postType' => $post_type->name,
                    'restBase' => AstroPress_Bridge_Content::restBase($post_type),
                    'title' => $post_type->labels->name,
                    'page' => $page,
                ];
            }
        }

        return null;
    }

    public static function resolveTaxonomyArchive(string $path, int $page): ?array
    {

        $trimmed_path = trim($path, '/');

        if ($trimmed_path === '') {
            return null;
        }

        $segments = explode('/', $trimmed_path);
        $term_slug = end($segments);

        foreach (get_taxonomies(['public' => true], 'objects') as $taxonomy) {
            $base = AstroPress_Bridge_Content::taxonomyBase($taxonomy);
            $base_segments = $base !== '' ? explode('/', $base) : [];
            $matches_base = ! empty($base_segments)
                && count($segments) > count($base_segments)
                && array_slice($segments, 0, count($base_segments)) === $base_segments;
            $matches_direct = count($segments) === 1;

            if (! $matches_base && ! $matches_direct) {
                continue;
            }

            $term = get_term_by('slug', $term_slug, $taxonomy->name);

            if (! $term || is_wp_error($term)) {
                continue;
            }

            return [
                'found' => true,
                'kind' => 'taxonomyArchive',
                'slug' => $term->slug,
                'taxonomy' => $taxonomy->name,
                'taxonomyRestBase' => $taxonomy->rest_base ?: $taxonomy->name,
                'termId' => $term->term_id,
                'termName' => $term->name,
                'postType' => AstroPress_Bridge_Content::taxonomyPrimaryPostType($taxonomy),
                'restBase' => 'posts',
                'title' => $term->name,
                'page' => $page,
            ];
        }

        return null;
    }

    public static function archive(WP_REST_Request $request): array
    {

        $kind = (string) $request->get_param('kind');
        $page = max(1, (int) ($request->get_param('page') ?: 1));
        $per_page = min(100, max(1, (int) ($request->get_param('perPage') ?: 10)));

        $args = [
            'post_status' => 'publish',
            'posts_per_page' => $per_page,
            'paged' => $page,
        ];

        if ($kind === 'search') {
            $args['post_type'] = array_values(get_post_types(['public' => true], 'names'));
            $args['s'] = (string) $request->get_param('search');
        } elseif ($kind === 'taxonomyArchive') {
            $taxonomy = (string) $request->get_param('taxonomy');
            $term_id = (int) $request->get_param('termId');
            $args['post_type'] = 'any';
            $args['tax_query'] = [[
                'taxonomy' => $taxonomy,
                'field' => 'term_id',
                'terms' => [$term_id],
            ]];
        } else {
            $args['post_type'] = (string) ($request->get_param('postType') ?: 'post');
        }

        $query = new WP_Query($args);

        return [
            'items' => array_map('AstroPress_Bridge_Content::postItem', $query->posts),
            'page' => $page,
            'perPage' => $per_page,
            'total' => (int) $query->found_posts,
            'totalPages' => (int) $query->max_num_pages,
        ];
    }

    public static function postItem(WP_Post $post): array
    {

        $featured_media = AstroPress_Bridge_Content::featuredMedia($post);

        return [
            'id' => $post->ID,
            'slug' => $post->post_name,
            'type' => $post->post_type,
            'link' => get_permalink($post),
            'title' => ['rendered' => get_the_title($post)],
            'content' => ['rendered' => apply_filters('the_content', $post->post_content)],
            'excerpt' => ['rendered' => apply_filters('the_excerpt', get_the_excerpt($post))],
            'date' => get_post_time(DATE_ATOM, false, $post),
            'modified' => get_post_modified_time(DATE_ATOM, false, $post),
            'acf' => AstroPress_Bridge_Content::acfFields($post),
            'taxonomies' => AstroPress_Bridge_Content::postTaxonomyIds($post),
            'terms' => AstroPress_Bridge_Content::postTerms($post),
            'featuredMediaId' => (int) get_post_thumbnail_id($post),
            'featuredMedia' => $featured_media,
        ];
    }

    public static function featuredMedia(WP_Post $post): ?array
    {

        $attachment_id = (int) get_post_thumbnail_id($post);

        if ($attachment_id <= 0) {
            return null;
        }

        return AstroPress_Bridge_Content::mediaItem($attachment_id);
    }

    public static function mediaItem(int $attachment_id): ?array
    {

        $attachment = get_post($attachment_id);

        if (! $attachment instanceof WP_Post || $attachment->post_type !== 'attachment') {
            return null;
        }

        $metadata = wp_get_attachment_metadata($attachment_id);
        $sizes = [];

        if (is_array($metadata) && isset($metadata['sizes']) && is_array($metadata['sizes'])) {
            foreach ($metadata['sizes'] as $name => $size) {
                if (! is_array($size)) {
                    continue;
                }

                $sizes[$name] = [
                    'file' => (string) ($size['file'] ?? ''),
                    'width' => (int) ($size['width'] ?? 0),
                    'height' => (int) ($size['height'] ?? 0),
                    'mimeType' => (string) ($size['mime-type'] ?? ''),
                    'url' => wp_get_attachment_image_url($attachment_id, $name) ?: '',
                ];
            }
        }

        return [
            'id' => $attachment_id,
            'url' => wp_get_attachment_url($attachment_id) ?: '',
            'alt' => (string) get_post_meta($attachment_id, '_wp_attachment_image_alt', true),
            'caption' => wp_get_attachment_caption($attachment_id) ?: '',
            'title' => get_the_title($attachment_id),
            'description' => $attachment->post_content,
            'mimeType' => get_post_mime_type($attachment_id) ?: '',
            'mediaType' => wp_attachment_is_image($attachment_id) ? 'image' : 'file',
            'width' => is_array($metadata) && isset($metadata['width']) ? (int) $metadata['width'] : null,
            'height' => is_array($metadata) && isset($metadata['height']) ? (int) $metadata['height'] : null,
            'sizes' => $sizes !== [] ? $sizes : (object) [],
        ];
    }

    public static function acfFields(WP_Post $post): array|stdClass
    {

        if (! function_exists('get_fields')) {
            return (object) [];
        }

        $fields = get_fields($post->ID);

        return is_array($fields) && $fields !== [] ? $fields : (object) [];
    }

    public static function postTaxonomyIds(WP_Post $post): array
    {

        $taxonomies = [];

        foreach (AstroPress_Bridge_Content::postTaxonomyObjects($post) as $taxonomy) {
            $terms = get_the_terms($post, $taxonomy->name);

            if (! is_array($terms)) {
                $taxonomies[$taxonomy->name] = [];
                continue;
            }

            $taxonomies[$taxonomy->name] = array_map(
                fn (WP_Term $term): int => (int) $term->term_id,
                array_values($terms),
            );
        }

        return $taxonomies;
    }

    public static function postTerms(WP_Post $post): array
    {

        $taxonomies = [];

        foreach (AstroPress_Bridge_Content::postTaxonomyObjects($post) as $taxonomy) {
            $terms = get_the_terms($post, $taxonomy->name);

            if (! is_array($terms)) {
                $taxonomies[$taxonomy->name] = [];
                continue;
            }

            $taxonomies[$taxonomy->name] = array_map('AstroPress_Bridge_Content::termItem', array_values($terms));
        }

        return $taxonomies;
    }

    public static function postTaxonomyObjects(WP_Post $post): array
    {

        return array_values(get_object_taxonomies($post->post_type, 'objects'));
    }

    public static function termItem(WP_Term $term): array
    {

        $link = get_term_link($term);

        return [
            'id' => (int) $term->term_id,
            'termId' => (int) $term->term_id,
            'taxonomy' => $term->taxonomy,
            'slug' => $term->slug,
            'name' => $term->name,
            'description' => $term->description,
            'link' => is_wp_error($link) ? '' : $link,
            'parent' => (int) $term->parent,
            'count' => (int) $term->count,
        ];
    }

    public static function menus(): array
    {

        $locations = get_nav_menu_locations();
        $menus = [];

        foreach (wp_get_nav_menus() as $menu) {
            $items = wp_get_nav_menu_items($menu->term_id) ?: [];
            $menus[] = [
                'id' => $menu->term_id,
                'slug' => $menu->slug,
                'name' => $menu->name,
                'items' => array_map('AstroPress_Bridge_Content::menuItem', $items),
            ];
        }

        return [
            'registeredLocations' => get_registered_nav_menus(),
            'locations' => $locations,
            'menus' => $menus,
        ];
    }

    public static function menuItem(WP_Post $item): array
    {

        return [
            'id' => $item->ID,
            'parent' => (int) $item->menu_item_parent,
            'title' => $item->title,
            'url' => $item->url,
            'target' => $item->target,
            'classes' => array_values(array_filter($item->classes ?? [])),
            'object' => $item->object,
            'objectId' => (int) $item->object_id,
            'type' => $item->type,
        ];
    }

    public static function postsArchiveTitle(): string
    {

        $page_for_posts = (int) get_option('page_for_posts');

        if ($page_for_posts > 0) {
            return get_the_title($page_for_posts);
        }

        return __('Posts');
    }

    public static function stripPagination(string $path): array
    {

        if (preg_match('#^(.*)/page/([0-9]+)/?$#', $path, $matches)) {
            $base = $matches[1] ?: '/';
            return [$base === '' ? '/' : $base, max(1, (int) $matches[2])];
        }

        return [$path, 1];
    }

    public static function searchQuery(string $trimmed_path, array $query): ?string
    {

        $search = trim((string) ($query['s'] ?? $query['q'] ?? ''));

        if ($search !== '') {
            return $search;
        }

        $segments = array_values(array_filter(explode('/', $trimmed_path)));

        if (($segments[0] ?? '') === 'search') {
            return isset($segments[1]) ? urldecode($segments[1]) : '';
        }

        return null;
    }

    public static function archiveSlug(WP_Post_Type $post_type): string
    {

        if (is_string($post_type->has_archive)) {
            return trim($post_type->has_archive, '/');
        }

        if (is_array($post_type->rewrite) && isset($post_type->rewrite['slug'])) {
            return trim((string) $post_type->rewrite['slug'], '/');
        }

        return $post_type->name;
    }

    public static function taxonomyBase(WP_Taxonomy $taxonomy): string
    {

        if ($taxonomy->name === 'category') {
            return trim((string) get_option('category_base') ?: 'category', '/');
        }

        if ($taxonomy->name === 'post_tag') {
            return trim((string) get_option('tag_base') ?: 'tag', '/');
        }

        if (is_array($taxonomy->rewrite) && isset($taxonomy->rewrite['slug'])) {
            return trim((string) $taxonomy->rewrite['slug'], '/');
        }

        return $taxonomy->name;
    }

    public static function taxonomyPrimaryPostType(WP_Taxonomy $taxonomy): string
    {

        $object_types = array_values($taxonomy->object_type);
        return $object_types[0] ?? 'post';
    }

    public static function restBase(?WP_Post_Type $post_type): string
    {

        if (! $post_type) {
            return 'posts';
        }

        return $post_type->rest_base ?: $post_type->name;
    }

}
