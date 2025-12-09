<?php
/**
 * Plugin Name: QI Chatbot for WooCommerce
 * Description: Free QuantumBot widget (PL/EN, 200+ FAQ, AI fallback) dla sklepów WooCommerce.
 * Version: 0.1.0
 * Author: QuantumOwner
 * License: GPL2+
 */

if (!defined('ABSPATH')) {
    exit;
}

define('QICHATBOT_VERSION', '0.1.0');
define('QICHATBOT_PATH', plugin_dir_path(__FILE__));
define('QICHATBOT_URL', plugin_dir_url(__FILE__));
define('QICHATBOT_BASENAME', plugin_basename(__FILE__));

require_once QICHATBOT_PATH . 'includes/class-qichatbot.php';

QI_Chatbot::instance();
