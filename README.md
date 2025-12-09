# WooCommerce AI Chatbot (QI Chatbot)

This repository contains the source code of the QI Chatbot plugin for WordPress WooCommerce. The plugin adds an AI‑powered chat widget to your store front and includes an admin settings page to configure integration with your QuantumSpace AI backend and WooCommerce REST API.

## Features

- Adds a configurable chat widget to your WooCommerce store (front‑end).
- Two language versions (Polish and English) with editable FAQ templates stored as JSON.
- Settings panel in WordPress admin (left menu “QI Chatbot”) where you can configure:
  - **Workspace/Site ID**: identifies your chat workspace.
  - **Default language**: Auto, Polish or English.
  - **Theme color**: primary color of the chat widget (hex).
  - **API endpoint**: URL of your AI backend (default `https://app.quantumowner.ai/api/quantumbot`).
  - **AI key**: optional secret for connecting to your AI service (e.g., OpenAI).
  - **WooCommerce API keys**: consumer key and secret generated from WooCommerce → Settings → Advanced → REST API. These keys allow the plugin to fetch store data such as payment methods, shipping methods and product bestsellers.
  - **Logo URL**: optional custom logo shown in the chat header.
- Generates dynamic FAQ entries by combining your base FAQ (in `assets/json/faq-en.json` or `faq-pl.json`) with store information (payment methods, shipping methods, currency, best‑selling products).
- Uses Fuse.js for fuzzy search through FAQ content.
- Provides a REST endpoint `wp-json/qichatbot/v1/faq` that returns the combined FAQ for each locale.
- Outputs the chat widget automatically on the front-end using a script (`assets/js/qichatbot-widget.js`).

## Installation

1. Download this repository as a ZIP or clone it.
2. Copy the plugin folder to your WordPress installation under `wp-content/plugins/qichatbot`.
3. Activate the plugin via **Plugins → Installed Plugins** in your WordPress admin dashboard.
4. A new menu item **QI Chatbot** will appear in the left sidebar of your WordPress admin.

## Configuration

1. Go to **QI Chatbot → Settings** in your WordPress admin.
2. Enter your **Workspace/Site ID** provided by your QuantumSpace account.
3. (Optional) Change the **Default language** to “pl” or “en”. When set to “auto” the plugin will detect visitor language.
4. Adjust the **Theme color** to match your brand using a hex code.
5. (Optional) Override the **API endpoint** if you are self‑hosting the backend.
6. If you use a private AI service, provide your **AI key**.
7. Generate **WooCommerce REST API keys** (Consumer key and secret) from WooCommerce → Settings → Advanced → REST API and paste them into the corresponding fields. This step is required for dynamic FAQs and snapshot functions.
8. (Optional) Specify a custom **Logo URL**.

Save changes and reload your store front. The chat widget should appear in the lower right corner.

## Customization

- The base FAQ entries for each language are stored in `assets/json/faq-en.json` and `faq-pl.json`. You can modify or extend these files to suit your store.
- The appearance of the widget can be customized via the **Theme color** setting and by overriding the included CSS in your theme if needed.
- If you wish to build a custom front‑end or integrate the widget into your own theme, refer to the script in `assets/js/qichatbot-widget.js`.

## Development

- This plugin uses standard WordPress hooks and does not include any node modules or build steps. All JavaScript files included in `assets/js` are ready‑to‑use.
- To modify the plugin, edit the PHP files (`qichatbot.php` and `includes/class-qichatbot.php`) and assets as required.
- Pull requests and contributions are welcome. Please open an issue for feature requests or bugs.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
