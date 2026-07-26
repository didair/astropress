<?php

final class AstroPress_Bridge_Theme
{
    public static function forceTheme(): string
    {

        return ASTROPRESS_THEME;
    }

    public static function registerNavMenus(): void
    {

        $menus = AstroPress_Bridge_Theme::configuredMenus();

        if ($menus !== []) {
            register_nav_menus($menus);
        }
    }

    public static function configuredMenus(): array
    {

        if (! defined('ASTROPRESS_MENUS')) {
            return [];
        }

        $decoded = json_decode((string) ASTROPRESS_MENUS, true);

        if (! is_array($decoded)) {
            return [];
        }

        $menus = [];

        foreach ($decoded as $location => $label) {
            $location = preg_replace('/[^a-zA-Z0-9_-]/', '', (string) $location);

            if ($location === '') {
                continue;
            }

            $label = wp_strip_all_tags((string) $label);
            $menus[$location] = $label !== '' ? $label : $location;
        }

        return $menus;
    }

}
