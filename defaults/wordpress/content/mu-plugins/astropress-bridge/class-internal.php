<?php

final class AstroPress_Bridge_Internal
{
    public static function handleInternalRequests(): void
    {
        if (isset($_GET['astropress_internal_auth_action'])) {
            self::handleInternalAuthAction();
        }

        if (isset($_GET['astropress_internal_woocommerce'])) {
            add_action('wp_loaded', [self::class, 'handleInternalWooCommerce'], 0);
            return;
        }

        if (isset($_GET['astropress_internal_auth'])) {
            self::handleInternalAuth();
        }

        if (! isset($_GET['astropress_internal_hook'])) {
            return;
        }

        self::handleInternalHook();
    }

    public static function handleInternalHook(): void
    {

        AstroPress_Bridge_Internal::requireInternalRequest();

        $payload = json_decode((string) file_get_contents('php://input'), true);

        if (! is_array($payload)) {
            status_header(400);
            header('Content-Type: application/json; charset=utf-8');
            echo wp_json_encode(['message' => 'Invalid JSON payload']);
            exit;
        }

        $type = (string) ($payload['type'] ?? '');
        $hook = (string) ($payload['hook'] ?? '');
        $args = is_array($payload['args'] ?? null) ? array_values($payload['args']) : [];
        $context = is_array($payload['context'] ?? null) ? $payload['context'] : [];
        $omit_default_assets = AstroPress_Bridge_Internal::shouldOmitDefaultAssets();

        if ($hook === '' || ! in_array($type, ['action', 'filter'], true)) {
            status_header(400);
            header('Content-Type: application/json; charset=utf-8');
            echo wp_json_encode(['message' => 'Missing hook or invalid hook type']);
            exit;
        }

        AstroPress_Bridge_Internal::setupHookContext($context);

        if ($omit_default_assets) {
            AstroPress_Bridge_Internal::omitDefaultHookAssets($hook);
        }

        if ($type === 'action') {
            ob_start();
            do_action_ref_array($hook, $args);
            $rendered = (string) ob_get_clean();

            AstroPress_Bridge_Internal::json([
                'type' => 'action',
                'hook' => $hook,
                'rendered' => $rendered,
            ]);
        }

        $value = $payload['value'] ?? '';
        $filter_args = array_merge([$value], $args);
        $filtered = apply_filters_ref_array($hook, $filter_args);

        AstroPress_Bridge_Internal::json([
            'type' => 'filter',
            'hook' => $hook,
            'value' => $filtered,
            'rendered' => is_scalar($filtered) ? (string) $filtered : wp_json_encode($filtered),
        ]);
    }

    public static function handleInternalWooCommerce(): void
    {

        AstroPress_Bridge_Internal::requireInternalRequest();

        if (! class_exists('WooCommerce')) {
            AstroPress_Bridge_Internal::jsonError(404, 'woocommerce_inactive', 'WooCommerce is not active.');
        }

        if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
            AstroPress_Bridge_Internal::jsonError(405, 'method_not_allowed', 'WooCommerce account actions must use POST.');
        }

        $payload = json_decode((string) file_get_contents('php://input'), true);

        if (! is_array($payload)) {
            AstroPress_Bridge_Internal::jsonError(400, 'invalid_json', 'Invalid JSON payload.');
        }

        $action = sanitize_key((string) ($payload['action'] ?? ''));

        if ($action === 'customer') {
            AstroPress_Bridge_Internal::json(AstroPress_Bridge_Internal::woocommerceCustomer());
        }

        $user_id = get_current_user_id();

        if ($user_id <= 0) {
            AstroPress_Bridge_Internal::jsonError(401, 'auth_required', 'Authentication is required.');
        }

        if ($action === 'update_customer') {
            AstroPress_Bridge_Internal::json(AstroPress_Bridge_Internal::updateWooCommerceCustomer($payload, $user_id));
        }

        if ($action === 'orders') {
            AstroPress_Bridge_Internal::json(AstroPress_Bridge_Internal::woocommerceOrders($payload, $user_id));
        }

        if ($action === 'reviews') {
            AstroPress_Bridge_Internal::json(AstroPress_Bridge_Internal::woocommerceReviews($payload, $user_id));
        }

        if ($action === 'upsert_review') {
            AstroPress_Bridge_Internal::json(AstroPress_Bridge_Internal::upsertWooCommerceReview($payload, $user_id));
        }

        AstroPress_Bridge_Internal::jsonError(400, 'invalid_action', 'Unknown WooCommerce account action.');
    }

    public static function handleInternalAuth(): void
    {

        AstroPress_Bridge_Internal::requireInternalRequest();

        $action = sanitize_text_field((string) ($_GET['action'] ?? 'wp_rest'));
        $redirect_to = esc_url_raw((string) ($_GET['redirect_to'] ?? home_url('/')));

        AstroPress_Bridge_Internal::json(AstroPress_Bridge_Internal::authContext($action, $redirect_to));
    }

    public static function handleInternalAuthAction(): void
    {

        AstroPress_Bridge_Internal::requireInternalRequest();

        if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
            AstroPress_Bridge_Internal::jsonError(405, 'method_not_allowed', 'Auth actions must use POST.');
        }

        $payload = json_decode((string) file_get_contents('php://input'), true);

        if (! is_array($payload)) {
            AstroPress_Bridge_Internal::jsonError(400, 'invalid_json', 'Invalid JSON payload.');
        }

        $action = sanitize_key((string) ($payload['action'] ?? ''));
        $redirect_to = esc_url_raw((string) ($payload['redirectTo'] ?? home_url('/')));

        if ($action === 'login') {
            AstroPress_Bridge_Internal::handlePasswordLogin($payload, $redirect_to);
        }

        if ($action === 'logout') {
            wp_logout();
            AstroPress_Bridge_Internal::json(AstroPress_Bridge_Internal::authContext('wp_rest', $redirect_to));
        }

        if ($action === 'register') {
            AstroPress_Bridge_Internal::handleUserRegistration($payload, $redirect_to);
        }

        if ($action === 'request_password_reset') {
            AstroPress_Bridge_Internal::handlePasswordResetRequest($payload);
        }

        if ($action === 'reset_password') {
            AstroPress_Bridge_Internal::handlePasswordReset($payload);
        }

        AstroPress_Bridge_Internal::jsonError(400, 'invalid_action', 'Unknown auth action.');
    }

    public static function handlePasswordLogin(array $payload, string $redirect_to): void
    {

        $login = sanitize_text_field((string) ($payload['login'] ?? ''));
        $password = (string) ($payload['password'] ?? '');
        $remember = (bool) ($payload['remember'] ?? false);

        if ($login === '' || $password === '') {
            AstroPress_Bridge_Internal::jsonError(400, 'missing_credentials', 'Email/username and password are required.');
        }

        $user = wp_signon([
            'user_login' => $login,
            'user_password' => $password,
            'remember' => $remember,
        ], is_ssl());

        if (is_wp_error($user)) {
            AstroPress_Bridge_Internal::jsonError(401, $user->get_error_code(), wp_strip_all_tags($user->get_error_message()));
        }

        wp_set_current_user((int) $user->ID);
        AstroPress_Bridge_Internal::json(AstroPress_Bridge_Internal::authContext('wp_rest', $redirect_to));
    }

    public static function handleUserRegistration(array $payload, string $redirect_to): void
    {

        if (! AstroPress_Bridge_Internal::registrationEnabled()) {
            AstroPress_Bridge_Internal::jsonError(403, 'registration_disabled', 'User registration is disabled.');
        }

        $email = sanitize_email((string) ($payload['email'] ?? ''));
        $password = (string) ($payload['password'] ?? '');
        $username = sanitize_user((string) ($payload['username'] ?? ''), true);
        $first_name = sanitize_text_field((string) ($payload['firstName'] ?? ''));
        $last_name = sanitize_text_field((string) ($payload['lastName'] ?? ''));
        $display_name = sanitize_text_field((string) ($payload['displayName'] ?? ''));
        $remember = (bool) ($payload['remember'] ?? false);
        $sign_in = (bool) ($payload['signIn'] ?? true);

        if ($email === '' || ! is_email($email)) {
            AstroPress_Bridge_Internal::jsonError(400, 'invalid_email', 'A valid email address is required.');
        }

        if (email_exists($email)) {
            AstroPress_Bridge_Internal::jsonError(409, 'email_exists', 'An account with this email already exists.');
        }

        if ($password === '') {
            AstroPress_Bridge_Internal::jsonError(400, 'missing_password', 'Password is required.');
        }

        if ($username === '') {
            $username = AstroPress_Bridge_Internal::uniqueUsernameFromEmail($email);
        } elseif (! validate_username($username)) {
            AstroPress_Bridge_Internal::jsonError(400, 'invalid_username', 'Username is invalid.');
        } elseif (username_exists($username)) {
            AstroPress_Bridge_Internal::jsonError(409, 'username_exists', 'An account with this username already exists.');
        }

        $user_id = AstroPress_Bridge_Internal::createUser($email, $username, $password);

        if (is_wp_error($user_id)) {
            AstroPress_Bridge_Internal::jsonError(400, $user_id->get_error_code(), wp_strip_all_tags($user_id->get_error_message()));
        }

        wp_update_user(array_filter([
            'ID' => (int) $user_id,
            'first_name' => $first_name,
            'last_name' => $last_name,
            'display_name' => $display_name,
        ], static fn ($value) => $value !== ''));

        $user = get_userdata((int) $user_id);

        if (! $user instanceof WP_User) {
            AstroPress_Bridge_Internal::jsonError(500, 'user_not_found', 'The user was created but could not be loaded.');
        }

        if ($sign_in) {
            wp_set_current_user((int) $user_id);
            wp_set_auth_cookie((int) $user_id, $remember, is_ssl());
            do_action('wp_login', $user->user_login, $user);
        }

        AstroPress_Bridge_Internal::json([
            'ok' => true,
            'user' => AstroPress_Bridge_Internal::currentUser($user),
            'auth' => AstroPress_Bridge_Internal::authContext('wp_rest', $redirect_to),
        ]);
    }

    public static function registrationEnabled(): bool
    {

        if ((bool) get_option('users_can_register')) {
            return true;
        }

        return class_exists('WooCommerce') && get_option('woocommerce_enable_myaccount_registration') === 'yes';
    }

    public static function uniqueUsernameFromEmail(string $email): string
    {

        $email_parts = explode('@', $email);
        $base = sanitize_user((string) ($email_parts[0] ?? ''), true);

        if ($base === '') {
            $base = 'user';
        }

        $username = $base;
        $suffix = 2;

        while (username_exists($username)) {
            $username = $base . $suffix;
            $suffix++;
        }

        return $username;
    }

    public static function createUser(string $email, string $username, string $password): int|WP_Error
    {

        if (function_exists('wc_create_new_customer')) {
            return wc_create_new_customer($email, $username, $password);
        }

        return wp_insert_user([
            'user_login' => $username,
            'user_email' => $email,
            'user_pass' => $password,
        ]);
    }

    public static function handlePasswordResetRequest(array $payload): void
    {

        $login = sanitize_text_field((string) ($payload['login'] ?? ''));

        if ($login === '') {
            AstroPress_Bridge_Internal::jsonError(400, 'missing_login', 'Email or username is required.');
        }

        $result = retrieve_password($login);

        if (is_wp_error($result)) {
            AstroPress_Bridge_Internal::jsonError(400, $result->get_error_code(), wp_strip_all_tags($result->get_error_message()));
        }

        AstroPress_Bridge_Internal::json([
            'ok' => true,
            'message' => 'Password reset email sent.',
        ]);
    }

    public static function handlePasswordReset(array $payload): void
    {

        $login = sanitize_text_field((string) ($payload['login'] ?? ''));
        $key = sanitize_text_field((string) ($payload['key'] ?? ''));
        $password = (string) ($payload['password'] ?? '');

        if ($login === '' || $key === '' || $password === '') {
            AstroPress_Bridge_Internal::jsonError(400, 'missing_reset_fields', 'Login, reset key, and new password are required.');
        }

        $user = check_password_reset_key($key, $login);

        if (is_wp_error($user)) {
            AstroPress_Bridge_Internal::jsonError(400, $user->get_error_code(), wp_strip_all_tags($user->get_error_message()));
        }

        reset_password($user, $password);

        AstroPress_Bridge_Internal::json([
            'ok' => true,
            'message' => 'Password reset.',
        ]);
    }

    public static function authContext(string $action, string $redirect_to): array
    {

        $user = wp_get_current_user();
        $logged_in = is_user_logged_in() && $user instanceof WP_User && $user->exists();

        return [
            'loggedIn' => $logged_in,
            'user' => $logged_in ? AstroPress_Bridge_Internal::currentUser($user) : null,
            'nonce' => [
                'action' => $action,
                'value' => wp_create_nonce($action),
            ],
            'restNonce' => wp_create_nonce('wp_rest'),
            'loginUrl' => wp_login_url($redirect_to),
            'logoutUrl' => wp_logout_url($redirect_to),
            'lostPasswordUrl' => wp_lostpassword_url($redirect_to),
            'registerUrl' => wp_registration_url(),
            'woocommerce' => AstroPress_Bridge_Internal::woocommerceAuthContext(),
        ];
    }

    public static function requireInternalRequest(): void
    {

        $configured_secret = defined('ASTROPRESS_INTERNAL_SECRET') ? (string) ASTROPRESS_INTERNAL_SECRET : '';
        $request_secret = (string) ($_SERVER['HTTP_X_ASTROPRESS_INTERNAL_SECRET'] ?? '');

        if ($configured_secret === '' || ! hash_equals($configured_secret, $request_secret)) {
            status_header(403);
            header('Content-Type: application/json; charset=utf-8');
            echo wp_json_encode(['message' => 'Forbidden']);
            exit;
        }
    }

    public static function currentUser(WP_User $user): array
    {

        $capabilities = [];

        foreach ((array) $user->allcaps as $capability => $enabled) {
            if ($enabled) {
                $capabilities[] = (string) $capability;
            }
        }

        return [
            'id' => (int) $user->ID,
            'username' => $user->user_login,
            'email' => $user->user_email,
            'name' => $user->display_name,
            'displayName' => $user->display_name,
            'firstName' => (string) get_user_meta($user->ID, 'first_name', true),
            'lastName' => (string) get_user_meta($user->ID, 'last_name', true),
            'roles' => array_values((array) $user->roles),
            'capabilities' => $capabilities,
            'avatarUrls' => AstroPress_Bridge_Internal::avatarUrls((int) $user->ID),
        ];
    }

    public static function avatarUrls(int $user_id): array
    {

        return [
            '24' => get_avatar_url($user_id, ['size' => 24]) ?: '',
            '48' => get_avatar_url($user_id, ['size' => 48]) ?: '',
            '96' => get_avatar_url($user_id, ['size' => 96]) ?: '',
        ];
    }

    public static function woocommerceAuthContext(): ?array
    {

        if (! class_exists('WooCommerce')) {
            return null;
        }

        return [
            'active' => true,
            'customer' => AstroPress_Bridge_Internal::woocommerceCustomer(),
            'myAccountUrl' => function_exists('wc_get_page_permalink') ? wc_get_page_permalink('myaccount') : home_url('/my-account/'),
            'cartUrl' => function_exists('wc_get_cart_url') ? wc_get_cart_url() : home_url('/cart/'),
            'checkoutUrl' => function_exists('wc_get_checkout_url') ? wc_get_checkout_url() : home_url('/checkout/'),
            'storeApiNonce' => wp_create_nonce('wc_store_api'),
        ];
    }

    public static function woocommerceCustomer(): ?array
    {

        $user_id = get_current_user_id();

        if ($user_id <= 0 || ! class_exists('WC_Customer')) {
            return null;
        }

        $customer = new WC_Customer($user_id);
        $user = get_userdata($user_id);

        return [
            'id' => $user_id,
            'username' => $user instanceof WP_User ? $user->user_login : '',
            'email' => $customer->get_email(),
            'firstName' => $customer->get_first_name(),
            'lastName' => $customer->get_last_name(),
            'displayName' => $user instanceof WP_User ? $user->display_name : trim($customer->get_first_name() . ' ' . $customer->get_last_name()),
            'dateCreated' => $customer->get_date_created() ? $customer->get_date_created()->date('c') : null,
            'dateModified' => $customer->get_date_modified() ? $customer->get_date_modified()->date('c') : null,
            'isPayingCustomer' => $customer->get_is_paying_customer(),
            'avatarUrl' => get_avatar_url($user_id) ?: '',
            'billing' => AstroPress_Bridge_Internal::customerBillingAddress($customer),
            'shipping' => AstroPress_Bridge_Internal::customerShippingAddress($customer),
        ];
    }

    public static function updateWooCommerceCustomer(array $payload, int $user_id): array
    {

        $customer = new WC_Customer($user_id);
        $user_update = ['ID' => $user_id];

        if (array_key_exists('email', $payload)) {
            $email = sanitize_email((string) $payload['email']);

            if ($email === '' || ! is_email($email)) {
                AstroPress_Bridge_Internal::jsonError(400, 'invalid_email', 'A valid email address is required.');
            }

            $existing_user = get_user_by('email', $email);

            if ($existing_user instanceof WP_User && (int) $existing_user->ID !== $user_id) {
                AstroPress_Bridge_Internal::jsonError(409, 'email_exists', 'An account with this email already exists.');
            }

            $customer->set_email($email);
            $user_update['user_email'] = $email;
        }

        if (array_key_exists('firstName', $payload)) {
            $first_name = sanitize_text_field((string) $payload['firstName']);
            $customer->set_first_name($first_name);
            $user_update['first_name'] = $first_name;
        }

        if (array_key_exists('lastName', $payload)) {
            $last_name = sanitize_text_field((string) $payload['lastName']);
            $customer->set_last_name($last_name);
            $user_update['last_name'] = $last_name;
        }

        if (array_key_exists('displayName', $payload)) {
            $user_update['display_name'] = sanitize_text_field((string) $payload['displayName']);
        }

        if (is_array($payload['billing'] ?? null)) {
            AstroPress_Bridge_Internal::applyCustomerAddress($customer, $payload['billing'], 'billing');
        }

        if (is_array($payload['shipping'] ?? null)) {
            AstroPress_Bridge_Internal::applyCustomerAddress($customer, $payload['shipping'], 'shipping');
        }

        $customer->save();

        if (count($user_update) > 1) {
            $result = wp_update_user($user_update);

            if (is_wp_error($result)) {
                AstroPress_Bridge_Internal::jsonError(400, $result->get_error_code(), wp_strip_all_tags($result->get_error_message()));
            }
        }

        return AstroPress_Bridge_Internal::woocommerceCustomer() ?? [];
    }

    public static function woocommerceOrders(array $payload, int $user_id): array
    {

        $status = $payload['status'] ?? [];
        $query = [
            'customer_id' => $user_id,
            'limit' => max(1, min(100, (int) ($payload['perPage'] ?? 20))),
            'paged' => max(1, (int) ($payload['page'] ?? 1)),
            'order' => strtoupper((string) ($payload['order'] ?? 'DESC')) === 'ASC' ? 'ASC' : 'DESC',
            'orderby' => sanitize_key((string) ($payload['orderby'] ?? 'date')),
        ];

        if ((is_array($status) && count($status) > 0) || (is_string($status) && $status !== '')) {
            $query['status'] = is_array($status) ? array_map('sanitize_key', $status) : sanitize_key((string) $status);
        }

        $orders = wc_get_orders($query);

        return array_values(array_map('AstroPress_Bridge_Internal::serializeWooCommerceOrder', $orders));
    }

    public static function woocommerceReviews(array $payload, int $user_id): array
    {

        $query = [
            'user_id' => $user_id,
            'type' => 'review',
            'number' => max(1, min(100, (int) ($payload['perPage'] ?? 20))),
            'paged' => max(1, (int) ($payload['page'] ?? 1)),
            'status' => sanitize_key((string) ($payload['status'] ?? 'all')),
        ];

        if ((int) ($payload['productId'] ?? 0) > 0) {
            $query['post_id'] = (int) $payload['productId'];
        }

        return array_values(array_map('AstroPress_Bridge_Internal::serializeWooCommerceReview', get_comments($query)));
    }

    public static function upsertWooCommerceReview(array $payload, int $user_id): array
    {

        $review_id = (int) ($payload['id'] ?? 0);
        $product_id = (int) ($payload['productId'] ?? 0);
        $review = trim((string) ($payload['review'] ?? ''));
        $rating = max(1, min(5, (int) ($payload['rating'] ?? 0)));
        $product = $product_id > 0 ? get_post($product_id) : null;
        $user = get_userdata($user_id);

        if (! $product || $product->post_type !== 'product') {
            AstroPress_Bridge_Internal::jsonError(400, 'invalid_product', 'A valid product is required.');
        }

        if ($review === '') {
            AstroPress_Bridge_Internal::jsonError(400, 'missing_review', 'Review content is required.');
        }

        if (! $user instanceof WP_User) {
            AstroPress_Bridge_Internal::jsonError(401, 'auth_required', 'Authentication is required.');
        }

        if ($review_id > 0) {
            $comment = get_comment($review_id);

            if (! $comment || (int) $comment->user_id !== $user_id || (int) $comment->comment_post_ID !== $product_id || $comment->comment_type !== 'review') {
                AstroPress_Bridge_Internal::jsonError(404, 'review_not_found', 'Review not found.');
            }

            wp_update_comment([
                'comment_ID' => $review_id,
                'comment_content' => wp_kses_post($review),
            ]);
        } else {
            $review_id = wp_new_comment([
                'comment_post_ID' => $product_id,
                'comment_author' => $user->display_name,
                'comment_author_email' => $user->user_email,
                'comment_content' => wp_kses_post($review),
                'comment_type' => 'review',
                'user_id' => $user_id,
                'comment_approved' => get_option('comment_moderation') ? 0 : 1,
            ]);

            if (is_wp_error($review_id)) {
                AstroPress_Bridge_Internal::jsonError(400, $review_id->get_error_code(), wp_strip_all_tags($review_id->get_error_message()));
            }
        }

        update_comment_meta((int) $review_id, 'rating', $rating);
        update_comment_meta((int) $review_id, 'verified', wc_customer_bought_product($user->user_email, $user_id, $product_id) ? 1 : 0);

        return AstroPress_Bridge_Internal::serializeWooCommerceReview(get_comment((int) $review_id));
    }

    public static function customerBillingAddress(WC_Customer $customer): array
    {

        return [
            'firstName' => $customer->get_billing_first_name(),
            'lastName' => $customer->get_billing_last_name(),
            'company' => $customer->get_billing_company(),
            'address1' => $customer->get_billing_address_1(),
            'address2' => $customer->get_billing_address_2(),
            'city' => $customer->get_billing_city(),
            'postcode' => $customer->get_billing_postcode(),
            'country' => $customer->get_billing_country(),
            'state' => $customer->get_billing_state(),
            'email' => $customer->get_billing_email(),
            'phone' => $customer->get_billing_phone(),
        ];
    }

    public static function customerShippingAddress(WC_Customer $customer): array
    {

        return [
            'firstName' => $customer->get_shipping_first_name(),
            'lastName' => $customer->get_shipping_last_name(),
            'company' => $customer->get_shipping_company(),
            'address1' => $customer->get_shipping_address_1(),
            'address2' => $customer->get_shipping_address_2(),
            'city' => $customer->get_shipping_city(),
            'postcode' => $customer->get_shipping_postcode(),
            'country' => $customer->get_shipping_country(),
            'state' => $customer->get_shipping_state(),
            'phone' => method_exists($customer, 'get_shipping_phone') ? $customer->get_shipping_phone() : '',
        ];
    }

    public static function applyCustomerAddress(WC_Customer $customer, array $address, string $type): void
    {

        $fields = [
            'firstName' => 'first_name',
            'lastName' => 'last_name',
            'company' => 'company',
            'address1' => 'address_1',
            'address2' => 'address_2',
            'city' => 'city',
            'postcode' => 'postcode',
            'country' => 'country',
            'state' => 'state',
            'email' => 'email',
            'phone' => 'phone',
        ];

        foreach ($fields as $input_key => $method_suffix) {
            if (! array_key_exists($input_key, $address)) {
                continue;
            }

            $method = 'set_' . $type . '_' . $method_suffix;

            if (method_exists($customer, $method)) {
                $customer->{$method}(sanitize_text_field((string) $address[$input_key]));
            }
        }
    }

    public static function serializeWooCommerceOrder(WC_Order $order): array
    {

        $line_items = [];

        foreach ($order->get_items() as $item) {
            if (! $item instanceof WC_Order_Item_Product) {
                continue;
            }

            $line_items[] = AstroPress_Bridge_Internal::serializeWooCommerceOrderLineItem($item);
        }

        return [
            'id' => $order->get_id(),
            'number' => $order->get_order_number(),
            'status' => $order->get_status(),
            'currency' => $order->get_currency(),
            'dateCreated' => $order->get_date_created() ? $order->get_date_created()->date('c') : null,
            'dateModified' => $order->get_date_modified() ? $order->get_date_modified()->date('c') : null,
            'total' => $order->get_total(),
            'subtotal' => $order->get_subtotal(),
            'discountTotal' => $order->get_discount_total(),
            'shippingTotal' => $order->get_shipping_total(),
            'paymentMethod' => $order->get_payment_method(),
            'paymentMethodTitle' => $order->get_payment_method_title(),
            'customerNote' => $order->get_customer_note(),
            'billing' => [
                'firstName' => $order->get_billing_first_name(),
                'lastName' => $order->get_billing_last_name(),
                'company' => $order->get_billing_company(),
                'address1' => $order->get_billing_address_1(),
                'address2' => $order->get_billing_address_2(),
                'city' => $order->get_billing_city(),
                'postcode' => $order->get_billing_postcode(),
                'country' => $order->get_billing_country(),
                'state' => $order->get_billing_state(),
                'email' => $order->get_billing_email(),
                'phone' => $order->get_billing_phone(),
            ],
            'shipping' => [
                'firstName' => $order->get_shipping_first_name(),
                'lastName' => $order->get_shipping_last_name(),
                'company' => $order->get_shipping_company(),
                'address1' => $order->get_shipping_address_1(),
                'address2' => $order->get_shipping_address_2(),
                'city' => $order->get_shipping_city(),
                'postcode' => $order->get_shipping_postcode(),
                'country' => $order->get_shipping_country(),
                'state' => $order->get_shipping_state(),
                'phone' => method_exists($order, 'get_shipping_phone') ? $order->get_shipping_phone() : '',
            ],
            'lineItems' => $line_items,
        ];
    }

    public static function serializeWooCommerceOrderLineItem(WC_Order_Item_Product $item): array
    {

        $product = $item->get_product();
        $image = null;

        if ($product) {
            $image_id = $product->get_image_id();
            $image_src = $image_id ? wp_get_attachment_image_src($image_id, 'woocommerce_thumbnail') : false;
            $image = $image_id ? [
                'id' => $image_id,
                'src' => $image_src ? $image_src[0] : wp_get_attachment_url($image_id),
                'alt' => get_post_meta($image_id, '_wp_attachment_image_alt', true),
            ] : null;
        }

        return [
            'id' => $item->get_id(),
            'productId' => $item->get_product_id(),
            'variationId' => $item->get_variation_id(),
            'name' => $item->get_name(),
            'quantity' => $item->get_quantity(),
            'subtotal' => $item->get_subtotal(),
            'total' => $item->get_total(),
            'sku' => $product ? $product->get_sku() : '',
            'permalink' => $product ? $product->get_permalink() : '',
            'image' => $image,
            'meta' => array_map(static fn ($meta) => $meta->get_data(), $item->get_meta_data()),
        ];
    }

    public static function serializeWooCommerceReview(?WP_Comment $comment): array
    {

        if (! $comment) {
            AstroPress_Bridge_Internal::jsonError(404, 'review_not_found', 'Review not found.');
        }

        $product_id = (int) $comment->comment_post_ID;

        return [
            'id' => (int) $comment->comment_ID,
            'productId' => $product_id,
            'productName' => get_the_title($product_id),
            'productPermalink' => get_permalink($product_id),
            'reviewer' => $comment->comment_author,
            'review' => $comment->comment_content,
            'rating' => (int) get_comment_meta((int) $comment->comment_ID, 'rating', true),
            'status' => wp_get_comment_status($comment),
            'verified' => (bool) get_comment_meta((int) $comment->comment_ID, 'verified', true),
            'dateCreated' => mysql_to_rfc3339($comment->comment_date_gmt ?: $comment->comment_date),
        ];
    }

    public static function shouldOmitDefaultAssets(): bool
    {

        return defined('ASTROPRESS_OMIT_DEFAULT_ASSETS') && (bool) ASTROPRESS_OMIT_DEFAULT_ASSETS;
    }

    public static function omitDefaultHookAssets(string $hook): void
    {

        if (! in_array($hook, ['wp_head', 'wp_footer'], true)) {
            return;
        }

        if (is_admin()) {
            return;
        }

        remove_action('wp_head', 'print_emoji_detection_script', 7);
        remove_action('wp_print_styles', 'print_emoji_styles');
        remove_action('wp_head', 'wp_generator');
        remove_action('wp_head', 'wlwmanifest_link');
        remove_action('wp_head', 'rsd_link');
        remove_action('wp_head', 'wp_shortlink_wp_head');
        remove_action('wp_head', 'rest_output_link_wp_head', 10);
        remove_action('wp_head', 'wp_oembed_add_discovery_links');
        remove_action('wp_head', 'wp_oembed_add_host_js');

        add_action('wp_enqueue_scripts', 'AstroPress_Bridge_Internal::dequeueDefaultAssets', 1000);
        add_action('wp_print_scripts', 'AstroPress_Bridge_Internal::dequeueDefaultAssets', 0);
        add_action('wp_print_styles', 'AstroPress_Bridge_Internal::dequeueDefaultAssets', 0);
        AstroPress_Bridge_Internal::dequeueDefaultAssets();
    }

    public static function dequeueDefaultAssets(): void
    {

        if (is_admin()) {
            return;
        }

        $scripts = [
            'jquery',
            'jquery-core',
            'jquery-migrate',
            'wp-emoji',
            'wp-emoji-release',
        ];
        $styles = [
            'wp-emoji-styles',
            'emoji-styles',
            'global-styles',
            'classic-theme-styles',
            'wp-block-library-theme',
        ];

        foreach ($scripts as $handle) {
            wp_dequeue_script($handle);
        }

        foreach ($styles as $handle) {
            wp_dequeue_style($handle);
        }
    }

    public static function setupHookContext(array $context): void
    {

        $route = is_array($context['route'] ?? null) ? $context['route'] : [];
        $item = is_array($route['item'] ?? null) ? $route['item'] : [];
        $post_id = (int) ($item['id'] ?? 0);

        if ($post_id <= 0) {
            return;
        }

        $context_post = get_post($post_id);

        if (! $context_post) {
            return;
        }

        global $post;
        $post = $context_post;
        $GLOBALS['post'] = $context_post;
        setup_postdata($context_post);

        if (function_exists('wc_get_product') && $context_post->post_type === 'product') {
            $GLOBALS['product'] = wc_get_product($context_post);
        }
    }

    public static function json(mixed $payload): void
    {

        header('Content-Type: application/json; charset=utf-8');
        echo wp_json_encode($payload);
        exit;
    }

    public static function jsonError(int $status, string $code, string $message): void
    {

        status_header($status);
        AstroPress_Bridge_Internal::json([
            'ok' => false,
            'code' => $code,
            'message' => $message,
        ]);
    }

}
