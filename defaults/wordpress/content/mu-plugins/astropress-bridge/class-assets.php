<?php

final class AstroPress_Bridge_Assets
{
    public static function registerBundledBlocks(): void
    {

        $manifest = AstroPress_Bridge_Assets::assetsManifest();

        foreach (($manifest['blocks'] ?? []) as $block) {
            foreach (($block['entries'] ?? []) as $entry) {
                AstroPress_Bridge_Assets::registerAssetEntry($entry);
            }

            $directory = AstroPress_Bridge_Assets::projectPath((string) ($block['directory'] ?? ''));

            if ($directory && file_exists($directory . '/block.json')) {
                register_block_type($directory);
            }
        }
    }

    public static function blocks(): array
    {

        $manifest_file = defined('ASTROPRESS_ASSETS_MANIFEST') ? (string) ASTROPRESS_ASSETS_MANIFEST : '';
        $manifest = AstroPress_Bridge_Assets::assetsManifest();
        $registry = WP_Block_Type_Registry::get_instance();

        return [
            'manifest' => [
                'path' => $manifest_file,
                'exists' => $manifest_file !== '' && file_exists($manifest_file),
            ],
            'blocks' => array_map(function (array $block) use ($registry) {
                $name = (string) ($block['name'] ?? '');
                $directory = AstroPress_Bridge_Assets::projectPath((string) ($block['directory'] ?? ''));
                $block_type = $name !== '' && $registry->is_registered($name) ? $registry->get_registered($name) : null;

                return [
                    'name' => $name,
                    'directory' => $directory,
                    'blockJson' => $directory ? $directory . '/block.json' : null,
                    'blockJsonExists' => $directory ? file_exists($directory . '/block.json') : false,
                    'registered' => $name !== '' && $registry->is_registered($name),
                    'editorScriptHandles' => AstroPress_Bridge_Assets::blockTypeProperty($block_type, 'editor_script_handles'),
                    'scriptHandles' => AstroPress_Bridge_Assets::blockTypeProperty($block_type, 'script_handles'),
                    'styleHandles' => AstroPress_Bridge_Assets::blockTypeProperty($block_type, 'style_handles'),
                    'registeredAssets' => array_map('AstroPress_Bridge_Assets::assetStatus', is_array($block['entries'] ?? null) ? $block['entries'] : []),
                    'entries' => $block['entries'] ?? [],
                ];
            }, is_array($manifest['blocks'] ?? null) ? $manifest['blocks'] : []),
        ];
    }

    public static function blockTypeProperty($block_type, string $property): array
    {

        if (! is_object($block_type) || ! isset($block_type->{$property}) || ! is_array($block_type->{$property})) {
            return [];
        }

        return array_values($block_type->{$property});
    }

    public static function assetStatus(array $entry): array
    {

        $handle = (string) ($entry['handle'] ?? '');
        $kind = (string) ($entry['kind'] ?? '');

        return [
            'handle' => $handle,
            'kind' => $kind,
            'registered' => $kind === 'style' ? wp_style_is($handle, 'registered') : wp_script_is($handle, 'registered'),
            'enqueued' => $kind === 'style' ? wp_style_is($handle, 'enqueued') : wp_script_is($handle, 'enqueued'),
        ];
    }

    public static function enqueuePluginAssets(): void
    {

        $manifest = AstroPress_Bridge_Assets::assetsManifest();

        foreach (($manifest['plugins'] ?? []) as $entry) {
            AstroPress_Bridge_Assets::enqueueAssetEntry($entry);
        }
    }

    public static function enqueueBlockAssets(): void
    {

        $manifest = AstroPress_Bridge_Assets::assetsManifest();

        foreach (($manifest['blocks'] ?? []) as $block) {
            foreach (($block['entries'] ?? []) as $entry) {
                AstroPress_Bridge_Assets::enqueueAssetEntry($entry);
            }
        }
    }

    public static function assetsManifest(): array
    {

        static $manifest = null;

        if (is_array($manifest)) {
            return $manifest;
        }

        $file = defined('ASTROPRESS_ASSETS_MANIFEST') ? (string) ASTROPRESS_ASSETS_MANIFEST : '';

        if ($file === '' || ! file_exists($file)) {
            $manifest = [];
            return $manifest;
        }

        $decoded = json_decode((string) file_get_contents($file), true);
        $manifest = is_array($decoded) ? $decoded : [];
        return $manifest;
    }

    public static function enqueueAssetEntry(array $entry): void
    {

        $file = (string) ($entry['file'] ?? '');
        $handle = (string) ($entry['handle'] ?? '');

        if ($file === '' || $handle === '') {
            return;
        }

        $dependencies = is_array($entry['dependencies'] ?? null) ? array_values($entry['dependencies']) : [];
        $url = AstroPress_Bridge_Assets::assetUrl($file);

        if (($entry['kind'] ?? '') === 'style') {
            wp_enqueue_style($handle, $url, $dependencies, null);
            return;
        }

        wp_enqueue_script($handle, $url, $dependencies, null, true);

        foreach (($entry['css'] ?? []) as $index => $css) {
            wp_enqueue_style($handle . '-css-' . $index, AstroPress_Bridge_Assets::assetUrl((string) $css), [], null);
        }
    }

    public static function registerAssetEntry(array $entry): void
    {

        $file = (string) ($entry['file'] ?? '');
        $handle = (string) ($entry['handle'] ?? '');

        if ($file === '' || $handle === '') {
            return;
        }

        $dependencies = is_array($entry['dependencies'] ?? null) ? array_values($entry['dependencies']) : [];
        $url = AstroPress_Bridge_Assets::assetUrl($file);

        if (($entry['kind'] ?? '') === 'style') {
            if (! wp_style_is($handle, 'registered')) {
                wp_register_style($handle, $url, $dependencies, null);
            }
            return;
        }

        if (! wp_script_is($handle, 'registered')) {
            wp_register_script($handle, $url, $dependencies, null, true);
        }

        foreach (($entry['css'] ?? []) as $index => $css) {
            $style_handle = $handle . '-css-' . $index;
            if (! wp_style_is($style_handle, 'registered')) {
                wp_register_style($style_handle, AstroPress_Bridge_Assets::assetUrl((string) $css), [], null);
            }
        }
    }

    public static function assetUrl(string $file): string
    {

        return content_url('/astropress-assets/' . ltrim($file, '/'));
    }

    public static function projectPath(string $relative_path): ?string
    {

        if ($relative_path === '' || ! defined('ASTROPRESS_ROOT')) {
            return null;
        }

        return rtrim((string) ASTROPRESS_ROOT, '/\\') . DIRECTORY_SEPARATOR . ltrim($relative_path, '/\\');
    }

}
