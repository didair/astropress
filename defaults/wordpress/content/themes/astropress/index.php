<?php
/**
 * AstroPress placeholder theme.
 *
 * The public frontend is rendered by Astro through the AstroPress proxy.
 */
?><!doctype html>
<html <?php language_attributes(); ?>>
<head>
    <meta charset="<?php bloginfo('charset'); ?>">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <?php wp_head(); ?>
</head>
<body <?php body_class(); ?>>
    <?php wp_body_open(); ?>
    <main style="font-family: system-ui, sans-serif; max-width: 720px; margin: 10vh auto; padding: 24px;">
        <h1>AstroPress</h1>
        <p>This placeholder theme keeps WordPress admin healthy. The frontend is rendered by Astro.</p>
    </main>
    <?php wp_footer(); ?>
</body>
</html>
