<?php
/**
 * Plugin Name: AstroPress Bridge
 * Description: Development bridge between WordPress and AstroPress.
 */

const ASTROPRESS_THEME = 'astropress';

$astropress_bridge_dir = __DIR__ . '/astropress-bridge';

require_once $astropress_bridge_dir . '/class-bridge.php';
require_once $astropress_bridge_dir . '/class-rest.php';
require_once $astropress_bridge_dir . '/class-theme.php';
require_once $astropress_bridge_dir . '/class-internal.php';
require_once $astropress_bridge_dir . '/class-assets.php';
require_once $astropress_bridge_dir . '/class-content.php';

AstroPress_Bridge::boot();
