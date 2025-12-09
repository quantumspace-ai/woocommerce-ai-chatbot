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
            'ai_key' => '',
            'woo_consumer_key' => '',
            'woo_consumer_secret' => '',
        ];
    }

    private function get_options() {
        $saved = get_option($this->option_key, []);
        return wp_parse_args(is_array($saved) ? $saved : [], $this->defaults());
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
            $apiEndpoint = '';
            if (!empty($value['api_endpoint'])) {
                $apiEndpoint = esc_url_raw($value['api_endpoint']);
            }
            if (!$apiEndpoint) {
                $apiEndpoint = $defaults['api_endpoint'];
            }

            $clean = [
                'site_id' => isset($value['site_id']) ? sanitize_text_field($value['site_id']) : '',
                'default_locale' => $locale,
                'theme_color' => $theme,
                'api_endpoint' => $apiEndpoint,
                'logo_url' => isset($value['logo_url']) ? esc_url_raw($value['logo_url']) : $defaults['logo_url'],
                'ai_key' => isset($value['ai_key']) ? sanitize_text_field($value['ai_key']) : '',
                'woo_consumer_key' => isset($value['woo_consumer_key']) ? sanitize_text_field($value['woo_consumer_key']) : '',
                'woo_consumer_secret' => isset($value['woo_consumer_secret']) ? sanitize_text_field($value['woo_consumer_secret']) : '',
            ];
            $clean['default_locale'] = $clean['default_locale'] ?: 'auto';
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
            <p><?php esc_html_e('Uzupelnij identyfikator Workspace oraz opcjonalne klucze, aby polaczyc sklep z Quantum Assist.', 'qi-chatbot'); ?></p>
            <form action="options.php" method="post">
                <?php settings_fields($this->option_key); ?>
                <table class="form-table" role="presentation">
                    <tr>
                        <th scope="row"><label for="qi-chatbot-site-id"><?php esc_html_e('Workspace / Site ID', 'qi-chatbot'); ?></label></th>
                        <td><input type="text" id="qi-chatbot-site-id" name="<?php echo esc_attr($this->option_key); ?>[site_id]" value="<?php echo esc_attr($options['site_id']); ?>" class="regular-text"/></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="qi-chatbot-locale"><?php esc_html_e('Domyslny jezyk', 'qi-chatbot'); ?></label></th>
                        <td>
                            <select id="qi-chatbot-locale" name="<?php echo esc_attr($this->option_key); ?>[default_locale]">
                                <option value="auto" <?php selected($options['default_locale'], 'auto'); ?>><?php esc_html_e('Automatycznie', 'qi-chatbot'); ?></option>
                                <option value="pl" <?php selected($options['default_locale'], 'pl'); ?>>Polski</option>
                                <option value="en" <?php selected($options['default_locale'], 'en'); ?>>English</option>
                            </select>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="qi-chatbot-theme"><?php esc_html_e('Kolor motywu', 'qi-chatbot'); ?></label></th>
                        <td><input type="text" id="qi-chatbot-theme" name="<?php echo esc_attr($this->option_key); ?>[theme_color]" value="<?php echo esc_attr($options['theme_color']); ?>" class="regular-text"/></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="qi-chatbot-api"><?php esc_html_e('Endpoint API (opcjonalnie)', 'qi-chatbot'); ?></label></th>
                        <td><input type="url" id="qi-chatbot-api" name="<?php echo esc_attr($this->option_key); ?>[api_endpoint]" value="<?php echo esc_attr($options['api_endpoint']); ?>" class="regular-text" placeholder="https://app.quantumowner.ai/api/quantumbot"/></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="qi-chatbot-ai-key"><?php esc_html_e('Klucz AI (opcjonalnie)', 'qi-chatbot'); ?></label></th>
                        <td><input type="text" id="qi-chatbot-ai-key" name="<?php echo esc_attr($this->option_key); ?>[ai_key]" value="<?php echo esc_attr($options['ai_key']); ?>" class="regular-text" placeholder="sk-..."/></td>
                    </tr>
                    <tr>
                        <th scope="row"><?php esc_html_e('WooCommerce API', 'qi-chatbot'); ?></th>
                        <td>
                            <p><?php esc_html_e('Podaj własne Consumer Key i Consumer Secret wygenerowane w WooCommerce > Ustawienia > Zaawansowane > REST API. Klucze umożliwią chatbotowi pobranie danych sklepu (produkty, wysyłka, płatności).', 'qi-chatbot'); ?></p>
                            <label for="qi-chatbot-woo-key"><?php esc_html_e('Consumer Key', 'qi-chatbot'); ?></label><br/>
                            <input type="text" id="qi-chatbot-woo-key" name="<?php echo esc_attr($this->option_key); ?>[woo_consumer_key]" value="<?php echo esc_attr($options['woo_consumer_key']); ?>" class="regular-text" placeholder="ck_xxxxxxxxx" /><br/><br/>
                            <label for="qi-chatbot-woo-secret"><?php esc_html_e('Consumer Secret', 'qi-chatbot'); ?></label><br/>
                            <input type="text" id="qi-chatbot-woo-secret" name="<?php echo esc_attr($this->option_key); ?>[woo_consumer_secret]" value="<?php echo esc_attr($options['woo_consumer_secret']); ?>" class="regular-text" placeholder="cs_xxxxxxxxx" />
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="qi-chatbot-logo"><?php esc_html_e('Logo (opcjonalnie)', 'qi-chatbot'); ?></label></th>
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
        $options = $this->get_options();
        $pl = $this->read_json(QICHATBOT_PATH . 'assets/json/faq-pl.json');
        $en = $this->read_json(QICHATBOT_PATH . 'assets/json/faq-en.json');
        $pl = $this->merge_store_faq($pl, 'pl', $options);
        $en = $this->merge_store_faq($en, 'en', $options);

        return rest_ensure_response([
            'pl' => $pl,
            'en' => $en,
        ]);
    }

    private function merge_store_faq(array $base, $locale, array $options) {
        $storeFaq = $this->build_store_faq($locale, $options);
        if (empty($storeFaq)) {
            return $base;
        }
        return array_merge($storeFaq, $base);
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
            'aiKey' => $options['ai_key'],
            'wooKeys' => $this->prepare_woo_keys_payload($options),
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

    private function prepare_woo_keys_payload($options) {
        if (empty($options['woo_consumer_key']) || empty($options['woo_consumer_secret'])) {
            return null;
        }
        return [
            'consumerKey' => $options['woo_consumer_key'],
            'consumerSecret' => $options['woo_consumer_secret'],
        ];
    }

    private function build_store_faq($locale, $options) {
        if (empty($options['woo_consumer_key']) || empty($options['woo_consumer_secret'])) {
            return [];
        }
        $snapshot = $this->get_store_snapshot();
        if (!$snapshot) {
            return [];
        }

        $shipping = empty($snapshot['shipping_methods']) ? [] : $snapshot['shipping_methods'];
        $payments = empty($snapshot['payment_methods']) ? [] : $snapshot['payment_methods'];
        $topProducts = empty($snapshot['top_products']) ? [] : $snapshot['top_products'];

        if ($locale === 'pl') {
            $entries = [
                [
                    'q' => sprintf(__('Jakie metody platnosci akceptuje %s?', 'qi-chatbot'), $snapshot['store_name']),
                    'a' => $payments ? sprintf(__('Akceptujemy: %s.', 'qi-chatbot'), implode(', ', $payments)) : __('Obecnie akceptujemy standardowe platnosci dostepne w Twoim koszyku.', 'qi-chatbot'),
                    'aliases' => ['platnosci', 'platnosc', 'placenie'],
                    'tags' => ['payments', 'sklep'],
                ],
                [
                    'q' => __('Jak wysylamy zamowienia?', 'qi-chatbot'),
                    'a' => $shipping ? sprintf(__('Wysylka realizowana jest przez: %s.', 'qi-chatbot'), implode(', ', $shipping)) : __('Standardowa dostawa kurierska realizowana jest natychmiast po spakowaniu.', 'qi-chatbot'),
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

            if ($topProducts) {
                $entries[] = [
                    'q' => __('Jakie produkty sprzedaja sie najlepiej?', 'qi-chatbot'),
                    'a' => sprintf(__('Klienci najczesciej wybieraja: %s.', 'qi-chatbot'), implode(', ', $topProducts)),
                    'aliases' => ['bestsellery', 'najbardziej popularne'],
                    'tags' => ['products'],
                ];
            }
            return $entries;
        }



        $entries = [
            [
                'q' => sprintf(__('Which payment methods does %s accept?', 'qi-chatbot'), $snapshot['store_name']),
                'a' => $payments ? sprintf(__('We currently accept: %s.', 'qi-chatbot'), implode(', ', $payments)) : __('We accept the payment methods you see at checkout.', 'qi-chatbot'),
                'aliases' => ['payment', 'pay', 'methods'],
                'tags' => ['payments', 'store'],
            ],
            [
                'q' => __('How do you ship orders?', 'qi-chatbot'),
                'a' => $shipping ? sprintf(__('Orders are shipped via: %s.', 'qi-chatbot'), implode(', ', $shipping)) : __('Standard courier shipping is dispatched as soon as we pack your order.', 'qi-chatbot'),
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

        if ($topProducts) {
            $entries[] = [
                'q' => __('What are your best sellers?', 'qi-chatbot'),
                'a' => sprintf(__('Our current best sellers are: %s.', 'qi-chatbot'), implode(', ', $topProducts)),
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




