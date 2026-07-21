<?php

if (!defined('ABSPATH')) {
    exit;
}

class QI_Chatbot {
    private static $instance = null;
    private $option_key = 'qi_chatbot_options';

    public static function instance() {
        if (null === self::$instance) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    private function __construct() {
        add_action('admin_menu', [$this, 'register_admin_menu']);
        add_action('admin_init', [$this, 'register_settings']);
        add_action('admin_init', [$this, 'remove_legacy_browser_secrets']);
        add_action('rest_api_init', [$this, 'register_rest_routes']);
        add_action('wp_enqueue_scripts', [$this, 'enqueue_assets']);
        add_action('wp_footer', [$this, 'render_widget_root']);
        add_filter('plugin_action_links_' . QICHATBOT_BASENAME, [$this, 'add_plugin_action_links']);
    }

    private function defaults() {
        return [
            'site_id' => '',
            'default_locale' => 'auto',
            'theme_color' => '#0f172a',
            'api_endpoint' => 'https://app.quantumowner.ai/api/quantumbot',
            'logo_url' => QICHATBOT_URL . 'assets/logo.svg',
        ];
    }

    private function get_options() {
        $saved = get_option($this->option_key, []);
        return wp_parse_args(is_array($saved) ? $saved : [], $this->defaults());
    }

    public function remove_legacy_browser_secrets() {
        if (!current_user_can('manage_options')) {
            return;
        }

        $saved = get_option($this->option_key, []);
        if (!is_array($saved)) {
            return;
        }

        $legacy_keys = ['ai_key', 'woo_consumer_key', 'woo_consumer_secret'];
        $changed = false;
        foreach ($legacy_keys as $key) {
            if (array_key_exists($key, $saved)) {
                unset($saved[$key]);
                $changed = true;
            }
        }

        if ($changed) {
            update_option($this->option_key, $saved, false);
        }
    }

    public function register_admin_menu() {
        add_menu_page(
            __('QI Chatbot', 'qi-chatbot'),
            __('QI Chatbot', 'qi-chatbot'),
            'manage_options',
            'qi-chatbot',
            [$this, 'render_settings_page'],
            'dashicons-format-chat',
            58
        );
    }

    public function register_settings() {
        register_setting($this->option_key, $this->option_key, function ($value) {
            $defaults = $this->defaults();
            $locale = isset($value['default_locale']) ? sanitize_text_field($value['default_locale']) : 'auto';
            if (!in_array($locale, ['auto', 'pl', 'en'], true)) {
                $locale = 'auto';
            }

            $theme = isset($value['theme_color']) ? sanitize_hex_color($value['theme_color']) : '';
            if (!$theme) {
                $theme = $defaults['theme_color'];
            }

            $api_endpoint = !empty($value['api_endpoint']) ? esc_url_raw($value['api_endpoint']) : '';
            if (!$api_endpoint || 0 !== strpos($api_endpoint, 'https://')) {
                $api_endpoint = $defaults['api_endpoint'];
            }

            $clean = [
                'site_id' => isset($value['site_id']) ? sanitize_text_field($value['site_id']) : '',
                'default_locale' => $locale,
                'theme_color' => $theme,
                'api_endpoint' => $api_endpoint,
                'logo_url' => isset($value['logo_url']) ? esc_url_raw($value['logo_url']) : $defaults['logo_url'],
            ];

            return wp_parse_args($clean, $defaults);
        });
    }

    public function render_settings_page() {
        if (!current_user_can('manage_options')) {
            return;
        }
        $options = $this->get_options();
        ?>
        <div class="wrap">
            <h1><?php esc_html_e('QI Chatbot', 'qi-chatbot'); ?></h1>
            <p><?php esc_html_e('Configure the public widget and its server-side QuantumSpace workspace.', 'qi-chatbot'); ?></p>
            <div class="notice notice-info inline">
                <p><?php esc_html_e('Provider and WooCommerce secrets are never sent to the browser. Configure private credentials only in the server-side AI backend.', 'qi-chatbot'); ?></p>
            </div>
            <form action="options.php" method="post">
                <?php settings_fields($this->option_key); ?>
                <table class="form-table" role="presentation">
                    <tr>
                        <th scope="row"><label for="qi-chatbot-site-id"><?php esc_html_e('Workspace / Site ID', 'qi-chatbot'); ?></label></th>
                        <td><input type="text" id="qi-chatbot-site-id" name="<?php echo esc_attr($this->option_key); ?>[site_id]" value="<?php echo esc_attr($options['site_id']); ?>" class="regular-text"/></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="qi-chatbot-locale"><?php esc_html_e('Default language', 'qi-chatbot'); ?></label></th>
                        <td>
                            <select id="qi-chatbot-locale" name="<?php echo esc_attr($this->option_key); ?>[default_locale]">
                                <option value="auto" <?php selected($options['default_locale'], 'auto'); ?>><?php esc_html_e('Automatic', 'qi-chatbot'); ?></option>
                                <option value="pl" <?php selected($options['default_locale'], 'pl'); ?>>Polski</option>
                                <option value="en" <?php selected($options['default_locale'], 'en'); ?>>English</option>
                            </select>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="qi-chatbot-theme"><?php esc_html_e('Theme color', 'qi-chatbot'); ?></label></th>
                        <td><input type="text" id="qi-chatbot-theme" name="<?php echo esc_attr($this->option_key); ?>[theme_color]" value="<?php echo esc_attr($options['theme_color']); ?>" class="regular-text"/></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="qi-chatbot-api"><?php esc_html_e('Server-side AI endpoint', 'qi-chatbot'); ?></label></th>
                        <td><input type="url" id="qi-chatbot-api" name="<?php echo esc_attr($this->option_key); ?>[api_endpoint]" value="<?php echo esc_attr($options['api_endpoint']); ?>" class="regular-text" placeholder="https://app.quantumowner.ai/api/quantumbot"/></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="qi-chatbot-logo"><?php esc_html_e('Logo URL', 'qi-chatbot'); ?></label></th>
                        <td><input type="url" id="qi-chatbot-logo" name="<?php echo esc_attr($this->option_key); ?>[logo_url]" value="<?php echo esc_attr($options['logo_url']); ?>" class="regular-text"/></td>
                    </tr>
                </table>
                <?php submit_button(); ?>
            </form>
        </div>
        <?php
    }

    public function register_rest_routes() {
        register_rest_route(
            'qichatbot/v1',
            '/faq',
            [
                'methods' => WP_REST_Server::READABLE,
                'callback' => [$this, 'handle_faq'],
                'permission_callback' => '__return_true',
            ]
        );
    }

    public function handle_faq() {
        $pl = $this->read_json(QICHATBOT_PATH . 'assets/json/faq-pl.json');
        $en = $this->read_json(QICHATBOT_PATH . 'assets/json/faq-en.json');
        $pl = $this->merge_store_faq($pl, 'pl');
        $en = $this->merge_store_faq($en, 'en');

        return rest_ensure_response([
            'pl' => $pl,
            'en' => $en,
        ]);
    }

    private function merge_store_faq(array $base, $locale) {
        $store_faq = $this->build_store_faq($locale);
        if (empty($store_faq)) {
            return $base;
        }
        return array_merge($store_faq, $base);
    }

    private function read_json($path) {
        if (!file_exists($path)) {
            return [];
        }
        $contents = file_get_contents($path);
        $decoded = json_decode($contents, true);
        return is_array($decoded) ? $decoded : [];
    }

    public function enqueue_assets() {
        if (is_admin()) {
            return;
        }
        $options = $this->get_options();

        wp_enqueue_script('qi-chatbot-widget', QICHATBOT_URL . 'assets/js/qichatbot-widget.js', [], QICHATBOT_VERSION, true);
        $config = [
            'siteId' => $options['site_id'],
            'locale' => $options['default_locale'] === 'auto' ? null : $options['default_locale'],
            'themeColor' => $options['theme_color'],
            'position' => 'bottom-right',
            'apiEndpoint' => $options['api_endpoint'],
            'logoUrl' => $options['logo_url'],
            'faqEndpoint' => rest_url('qichatbot/v1/faq'),
            'fuseUrl' => QICHATBOT_URL . 'assets/js/fuse.min.js',
            'storeUrl' => home_url('/'),
            'storeSnapshot' => $this->get_store_snapshot(),
        ];

        wp_add_inline_script(
            'qi-chatbot-widget',
            'window.OWNERBOT = ' . wp_json_encode($config) . ';',
            'before'
        );
    }

    public function render_widget_root() {
        if (is_admin()) {
            return;
        }
        echo '<div id="ownerbot-root" data-qi-chatbot="true"></div>';
    }

    public function add_plugin_action_links($links) {
        $url = admin_url('admin.php?page=qi-chatbot');
        $links[] = '<a href="' . esc_url($url) . '">' . esc_html__('Settings', 'qi-chatbot') . '</a>';
        return $links;
    }

    private function build_store_faq($locale) {
        $snapshot = $this->get_store_snapshot();
        if (!$snapshot) {
            return [];
        }

        $shipping = empty($snapshot['shipping_methods']) ? [] : $snapshot['shipping_methods'];
        $payments = empty($snapshot['payment_methods']) ? [] : $snapshot['payment_methods'];
        $top_products = empty($snapshot['top_products']) ? [] : $snapshot['top_products'];

        if ('pl' === $locale) {
            $entries = [
                [
                    'q' => sprintf(__('Jakie metody platnosci akceptuje %s?', 'qi-chatbot'), $snapshot['store_name']),
                    'a' => $payments ? sprintf(__('Akceptujemy: %s.', 'qi-chatbot'), implode(', ', $payments)) : __('Obecnie akceptujemy standardowe platnosci dostepne w koszyku.', 'qi-chatbot'),
                    'aliases' => ['platnosci', 'platnosc', 'placenie'],
                    'tags' => ['payments', 'sklep'],
                ],
                [
                    'q' => __('Jak wysylamy zamowienia?', 'qi-chatbot'),
                    'a' => $shipping ? sprintf(__('Wysylka realizowana jest przez: %s.', 'qi-chatbot'), implode(', ', $shipping)) : __('Dostepne metody wysylki sa widoczne w koszyku.', 'qi-chatbot'),
                    'aliases' => ['wysylka', 'dostawa', 'kurier'],
                    'tags' => ['shipping', 'sklep'],
                ],
                [
                    'q' => __('W jakiej walucie naliczane sa ceny?', 'qi-chatbot'),
                    'a' => sprintf(__('Ceny widoczne w sklepie sa naliczane w walucie %s (%s).', 'qi-chatbot'), $snapshot['currency_symbol'], $snapshot['currency_code']),
                    'aliases' => ['waluta', 'platnosc waluta'],
                    'tags' => ['currency'],
                ],
            ];

            if ($top_products) {
                $entries[] = [
                    'q' => __('Jakie produkty sprzedaja sie najlepiej?', 'qi-chatbot'),
                    'a' => sprintf(__('Klienci najczesciej wybieraja: %s.', 'qi-chatbot'), implode(', ', $top_products)),
                    'aliases' => ['bestsellery', 'najbardziej popularne'],
                    'tags' => ['products'],
                ];
            }
            return $entries;
        }

        $entries = [
            [
                'q' => sprintf(__('Which payment methods does %s accept?', 'qi-chatbot'), $snapshot['store_name']),
                'a' => $payments ? sprintf(__('We currently accept: %s.', 'qi-chatbot'), implode(', ', $payments)) : __('Available payment methods are shown at checkout.', 'qi-chatbot'),
                'aliases' => ['payment', 'pay', 'methods'],
                'tags' => ['payments', 'store'],
            ],
            [
                'q' => __('How do you ship orders?', 'qi-chatbot'),
                'a' => $shipping ? sprintf(__('Orders are shipped via: %s.', 'qi-chatbot'), implode(', ', $shipping)) : __('Available delivery methods are shown at checkout.', 'qi-chatbot'),
                'aliases' => ['shipping', 'delivery', 'carrier'],
                'tags' => ['shipping', 'store'],
            ],
            [
                'q' => __('Which currency do you charge?', 'qi-chatbot'),
                'a' => sprintf(__('All prices are shown in %s (%s).', 'qi-chatbot'), $snapshot['currency_symbol'], $snapshot['currency_code']),
                'aliases' => ['currency', 'pricing'],
                'tags' => ['currency'],
            ],
        ];

        if ($top_products) {
            $entries[] = [
                'q' => __('What are your best sellers?', 'qi-chatbot'),
                'a' => sprintf(__('Our current best sellers are: %s.', 'qi-chatbot'), implode(', ', $top_products)),
                'aliases' => ['popular items', 'topsellers'],
                'tags' => ['products'],
            ];
        }

        return $entries;
    }

    private function get_store_snapshot() {
        if (!class_exists('WooCommerce')) {
            return null;
        }

        $snapshot = [
            'store_name' => get_bloginfo('name'),
            'currency_code' => get_option('woocommerce_currency', 'PLN'),
            'currency_symbol' => function_exists('get_woocommerce_currency_symbol') ? get_woocommerce_currency_symbol(get_option('woocommerce_currency', 'PLN')) : get_option('woocommerce_currency', 'PLN'),
            'payment_methods' => [],
            'shipping_methods' => [],
            'top_products' => [],
            'support_email' => get_option('woocommerce_email_from_address') ?: get_option('admin_email'),
        ];

        if (function_exists('WC')) {
            $gateways = WC()->payment_gateways()->payment_gateways();
            foreach ($gateways as $gateway) {
                if ('yes' === $gateway->enabled) {
                    $snapshot['payment_methods'][] = $gateway->get_title();
                }
            }

            $shipping_methods = WC()->shipping()->get_shipping_methods();
            foreach ($shipping_methods as $method) {
                if ('yes' === $method->enabled) {
                    $snapshot['shipping_methods'][] = $method->get_method_title();
                }
            }
        }

        if (function_exists('wc_get_products')) {
            $products = wc_get_products([
                'status' => 'publish',
                'limit' => 3,
                'orderby' => 'total_sales',
                'order' => 'DESC',
            ]);
            foreach ($products as $product) {
                $snapshot['top_products'][] = $product->get_name();
            }
        }

        return $snapshot;
    }
}
