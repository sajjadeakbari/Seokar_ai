<?php
/**
 * SeoKar AI API Handler Class
 *
 * Handles all interactions with external AI APIs.
 */

// Exit if accessed directly.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

// Ensure the main plugin option name constant is available
if ( ! defined( 'SEOKAR_AI_OPTION_NAME' ) ) {
    // This might happen if the file is accessed directly or too early.
    // For robust loading, this class should be included by the main plugin file.
    // define('SEOKAR_AI_OPTION_NAME', 'seokar_ai_settings'); // Fallback, but ideally set in main plugin file
    return; // Or trigger an error
}

class SeoKar_AI_API_Handler {

    /**
     * Plugin options.
     * @var array
     */
    private $options;

    /**
     * Preferred order of AI services.
     * The first service with a configured API key will be used.
     * @var array
     */
    private $service_priority = array( 'openai', 'google_ai', 'huggingface' );
    // TODO: Make this configurable in plugin settings in the future.

    /**
     * Constructor.
     * Loads plugin options.
     */
    public function __construct() {
        $this->options = get_option( SEOKAR_AI_OPTION_NAME, array() );
    }

    /**
     * Determines the active AI service based on configured API keys and priority.
     *
     * @return array|null An array containing 'service_name' and 'api_key', or null if no service is active.
     */
    private function get_active_service() {
        foreach ( $this->service_priority as $service_slug ) {
            $key_name = '';
            switch ( $service_slug ) {
                case 'openai':
                    $key_name = 'openai_api_key';
                    break;
                case 'google_ai':
                    $key_name = 'google_api_key';
                    break;
                case 'huggingface':
                    $key_name = 'huggingface_api_key';
                    break;
            }

            if ( ! empty( $key_name ) && ! empty( $this->options[ $key_name ] ) ) {
                return array(
                    'service_name' => $service_slug,
                    'api_key'      => $this->options[ $key_name ],
                );
            }
        }
        return null; // No active service found
    }

    /**
     * Makes an HTTP POST request to an AI API.
     *
     * @param string $url The API endpoint URL.
     * @param array $headers HTTP headers for the request.
     * @param array|string $body The request body (often JSON encoded).
     * @param string $service_name For error reporting.
     * @return array|WP_Error Decoded JSON response on success, WP_Error on failure.
     */
    private function make_api_request( $url, $headers, $body, $service_name ) {
        $args = array(
            'method'  => 'POST',
            'headers' => $headers,
            'body'    => is_array($body) ? wp_json_encode( $body ) : $body,
            'timeout' => apply_filters( 'seokar_ai_api_request_timeout', 30 ), // 30 seconds timeout, filterable
            'sslverify' => apply_filters('seokar_ai_api_sslverify', true), // Allow disabling SSL verification for local dev if needed
        );

        $response = wp_remote_post( $url, $args );

        if ( is_wp_error( $response ) ) {
            // Network error or other WordPress error
            return new WP_Error(
                'http_request_failed',
                sprintf(
                    /* translators: 1: AI Service name, 2: Error message */
                    __( 'HTTP request to %1$s failed. Error: %2$s', 'seokar-ai' ),
                    $service_name,
                    $response->get_error_message()
                )
            );
        }

        $response_code = wp_remote_retrieve_response_code( $response );
        $response_body = wp_remote_retrieve_body( $response );
        $decoded_body  = json_decode( $response_body, true );

        if ( $response_code >= 200 && $response_code < 300 ) {
            if ( json_last_error() !== JSON_ERROR_NONE ) {
                return new WP_Error(
                    'json_decode_error',
                     sprintf(
                        /* translators: 1: AI Service name, 2: JSON error message */
                        __( 'Failed to decode JSON response from %1$s. Error: %2$s', 'seokar-ai' ),
                        $service_name,
                        json_last_error_msg()
                    ),
                    array( 'response_body' => $response_body ) // Include raw body for debugging
                );
            }
            return $decoded_body; // Success
        } else {
            // API returned an error status code
            $error_message = __( 'Unknown API error.', 'seokar-ai' );
            if ( $decoded_body && isset( $decoded_body['error']['message'] ) ) { // OpenAI style error
                $error_message = $decoded_body['error']['message'];
            } elseif ( $decoded_body && isset( $decoded_body['message'] ) ) { // Some other APIs
                $error_message = $decoded_body['message'];
            } elseif ( ! empty( $response_body ) ) {
                $error_message = substr( strip_tags( $response_body ), 0, 200 ); // Show a snippet of the raw response
            }

            return new WP_Error(
                'api_error',
                sprintf(
                    /* translators: 1: AI Service name, 2: HTTP status code, 3: API error message */
                    __( '%1$s API Error (Code: %2$s): %3$s', 'seokar-ai' ),
                    $service_name,
                    $response_code,
                    $error_message
                ),
                array( 'status_code' => $response_code, 'response_body' => $decoded_body ?: $response_body )
            );
        }
    }

    /**
     * Prepares a prompt for title suggestions.
     *
     * @param string $current_title The current title of the post.
     * @param string $content_snippet A snippet of the post content.
     * @param string $service_name The name of the AI service being used.
     * @return string The generated prompt.
     */
    private function prepare_title_prompt( $current_title, $content_snippet, $service_name ) {
        $language = get_bloginfo('language'); // e.g., "fa-IR" or "en-US"
        $prompt = sprintf(
            __("You are an expert SEO copywriter. Suggest 5 SEO-friendly and engaging titles for a blog post. The post is in %s. \n", 'seokar-ai'),
            $language
        );
        if ( ! empty( $current_title ) ) {
            $prompt .= sprintf( __("The current working title is: \"%s\". You can improve it or suggest alternatives.\n", 'seokar-ai'), $current_title );
        }
        if ( ! empty( $content_snippet ) ) {
            $prompt .= sprintf( __("The main content starts with: \"%s...\".\n", 'seokar-ai'), $content_snippet );
        }
        $prompt .= __("Return the titles as a numbered list. Each title should be on a new line.", 'seokar-ai');
        return $prompt;
    }

    // TODO: Add more `prepare_..._prompt` methods for keywords, outline, content, categories, tags, page analysis.

    /**
     * Generic method to get a suggestion from an AI service.
     * This will be the primary method called by AJAX handlers.
     *
     * @param string $suggestion_type Type of suggestion (e.g., 'suggest_title', 'suggest_keywords').
     * @param string $current_title Current post title.
     * @param string $current_content Full current post content.
     * @return string|WP_Error The AI's suggestion (HTML formatted for titles/outlines) or WP_Error on failure.
     */
    public function get_suggestion( $suggestion_type, $current_title = '', $current_content = '' ) {
        $active_service_info = $this->get_active_service();

        if ( ! $active_service_info ) {
            return new WP_Error( 'no_active_service', __( 'No AI service API key is configured or active. Please check SeoKar AI settings.', 'seokar-ai' ) );
        }

        $service_name = $active_service_info['service_name'];
        $api_key      = $active_service_info['api_key'];
        $content_snippet = substr( wp_strip_all_tags( $current_content ), 0, 500 ); // Limit snippet length

        // Prepare data and endpoint based on service and suggestion type
        $url = '';
        $headers = array( 'Content-Type' => 'application/json' );
        $body_data = array();
        $prompt = '';

        // --- Service Specific Logic & Placeholder for API calls ---
        switch ( $service_name ) {
            case 'openai':
                $headers['Authorization'] = 'Bearer ' . $api_key;
                $url = 'https://api.openai.com/v1/chat/completions'; // Using chat completions endpoint
                $body_data['model'] = apply_filters('seokar_ai_openai_model', 'gpt-3.5-turbo'); // Filterable model
                // $body_data['max_tokens'] = 150; // Example, adjust per suggestion type
                // $body_data['temperature'] = 0.7; // Example

                switch ( $suggestion_type ) {
                    case 'suggest_title':
                        $prompt = $this->prepare_title_prompt( $current_title, $content_snippet, $service_name );
                        $body_data['messages'] = [['role' => 'user', 'content' => $prompt]];
                        $body_data['max_tokens'] = 200;
                        // ** ACTUAL API CALL WOULD BE HERE **
                        // $api_response = $this->make_api_request( $url, $headers, $body_data, 'OpenAI' );
                        // if (is_wp_error($api_response)) return $api_response;
                        // return $this->parse_openai_title_response($api_response); // You'd need a parser

                        // MOCK RESPONSE:
                        sleep(1); // Simulate delay
                        return "<ul><li>" . __('OpenAI: Suggested Title 1', 'seokar-ai') . "</li><li>" . __('OpenAI: Suggested Title 2 (from content)', 'seokar-ai') . "</li></ul>";

                    case 'suggest_keywords':
                        // $prompt = $this->prepare_keywords_prompt(...);
                        // $body_data['messages'] = [['role' => 'user', 'content' => $prompt]];
                        // ...
                        sleep(1);
                        return "<p>" . __('openai_keyword1, ai_keyword2, seo_keyword_from_openai', 'seokar-ai') . "</p>";

                    // TODO: Add other cases for OpenAI
                    default:
                        return new WP_Error( 'invalid_suggestion_type', sprintf(__( 'Suggestion type "%s" not implemented for OpenAI.', 'seokar-ai' ), $suggestion_type) );
                }
                break; // End openai case

            case 'google_ai':
                // Example for Google AI (Gemini) - This will vary based on the exact SDK/API used
                // $url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=' . $api_key;
                // $headers = array('Content-Type' => 'application/json'); // Key is in URL

                switch ( $suggestion_type ) {
                    case 'suggest_title':
                        $prompt = $this->prepare_title_prompt( $current_title, $content_snippet, $service_name );
                        /*
                        $body_data = [
                            'contents' => [
                                [
                                    'parts' => [
                                        ['text' => $prompt]
                                    ]
                                ]
                            ],
                            // 'generationConfig' => [ ... ] // Optional: temperature, maxOutputTokens etc.
                        ];
                        */
                        // ** ACTUAL API CALL WOULD BE HERE for Google AI **
                        // $api_response = $this->make_api_request( $url, $headers, $body_data, 'Google AI' );
                        // if (is_wp_error($api_response)) return $api_response;
                        // return $this->parse_google_ai_title_response($api_response);

                        // MOCK RESPONSE:
                        sleep(1);
                        return "<ul><li>" . __('GoogleAI: Title Suggestion A', 'seokar-ai') . "</li><li>" . __('GoogleAI: Title Suggestion B', 'seokar-ai') . "</li></ul>";
                    // TODO: Add other cases for Google AI
                    default:
                        return new WP_Error( 'invalid_suggestion_type', sprintf(__( 'Suggestion type "%s" not implemented for Google AI.', 'seokar-ai' ), $suggestion_type) );
                }
                break; // End google_ai case

            case 'huggingface':
                // Hugging Face Inference API - Requires model endpoint
                // $headers['Authorization'] = 'Bearer ' . $api_key;
                // $model_for_task = 'gpt2'; // EXAMPLE - choose appropriate model for the task
                // $url = 'https://api-inference.huggingface.co/models/' . $model_for_task;

                switch ( $suggestion_type ) {
                    case 'suggest_title':
                        // Hugging Face models often take direct inputs rather than complex prompts like OpenAI/Google
                        // $inputs = "Suggest a title for content: " . $content_snippet;
                        // $body_data = ['inputs' => $inputs, 'parameters' => [/* max_length, etc. */]];
                        // ** ACTUAL API CALL WOULD BE HERE for Hugging Face **
                        // $api_response = $this->make_api_request( $url, $headers, $body_data, 'Hugging Face' );
                        // if (is_wp_error($api_response)) return $api_response;
                        // return $this->parse_huggingface_response($api_response);

                        // MOCK RESPONSE:
                        sleep(1);
                        return "<ul><li>" . __('HF: A Title From Hugging Face', 'seokar-ai') . "</li></ul>";
                    // TODO: Add other cases for Hugging Face
                    default:
                        return new WP_Error( 'invalid_suggestion_type', sprintf(__( 'Suggestion type "%s" not implemented for Hugging Face.', 'seokar-ai' ), $suggestion_type) );
                }
                break; // End huggingface case

            default:
                return new WP_Error( 'unknown_service', __( 'The active AI service is unknown or not supported.', 'seokar-ai' ) );
        }

        // Fallback if no specific MOCK response was hit (shouldn't happen with current structure)
        return new WP_Error( 'not_implemented', __( 'This AI suggestion is not fully implemented yet.', 'seokar-ai' ) );
    }


    /**
     * Parses the title suggestion response from OpenAI.
     *
     * @param array $api_response The decoded JSON response from OpenAI API.
     * @return string HTML formatted list of titles, or error string.
     */
    private function parse_openai_title_response( $api_response ) {
        if ( isset( $api_response['choices'][0]['message']['content'] ) ) {
            $content = $api_response['choices'][0]['message']['content'];
            // Titles are expected to be a numbered list. Convert to HTML list.
            $titles = explode( "\n", trim( $content ) );
            $html_list = '<ul>';
            foreach ( $titles as $title ) {
                $title = trim( preg_replace( '/^\d+\.\s*/', '', $title ) ); // Remove numbering like "1. "
                if ( ! empty( $title ) ) {
                    $html_list .= '<li>' . esc_html( $title ) . '</li>';
                }
            }
            $html_list .= '</ul>';
            return $html_list;
        }
        return __( 'Could not parse title suggestions from OpenAI response.', 'seokar-ai' );
    }

    // TODO: Add `parse_..._response` methods for other services and other suggestion types.
    // For example:
    // private function parse_google_ai_title_response($api_response) { ... }
    // private function parse_openai_keywords_response($api_response) { ... }


    /**
     * Public method for page analysis (used by the front-end icon).
     *
     * @param string $current_title
     * @param string $current_content_snippet
     * @return string|WP_Error HTML analysis or WP_Error.
     */
    public function get_page_analysis( $current_title, $current_content_snippet ) {
        $active_service_info = $this->get_active_service();
        if ( ! $active_service_info ) {
            return new WP_Error( 'no_active_service', __( 'No AI service API key is configured.', 'seokar-ai' ) );
        }
        $service_name = $active_service_info['service_name'];
        // $api_key      = $active_service_info['api_key'];

        // MOCK RESPONSE for page analysis
        // You would build a prompt and call the respective AI service here.
        $prompt = sprintf(
            __("Analyze the following webpage content for SEO and readability, and provide actionable suggestions. Language: %s.\nTitle: \"%s\"\nContent Snippet: \"%s...\"\nSuggestions should cover: Title optimization, Meta description, Keyword focus, Content structure, Readability improvements.", 'seokar-ai'),
            get_bloginfo('language'),
            $current_title,
            $current_content_snippet
        );

        // Example: if ($service_name === 'openai') { /* make OpenAI call with $prompt */ }
        sleep(1); // Simulate delay
        $mock_analysis = "<h3>" . sprintf(esc_html__('Analysis for: %s', 'seokar-ai'), esc_html($current_title)) . "</h3>" .
                         "<p><strong>" . esc_html__('Overall (Mock):', 'seokar-ai') . "</strong> " . esc_html__('Good potential, needs keyword refinement.', 'seokar-ai') . "</p>" .
                         "<p><strong>" . esc_html__('Keywords (Mock):', 'seokar-ai') . "</strong> " . esc_html__('Consider focusing on "AI content strategy".', 'seokar-ai') . "</p>" .
                         "<p><strong>" . esc_html__('Readability (Mock):', 'seokar-ai') . "</strong> " . esc_html__('Break down longer paragraphs.', 'seokar-ai') . "</p>" .
                         "<p><small><em>" . esc_html__('Debug - Prompt for analysis:', 'seokar-ai') . " " . esc_html(substr($prompt, 0, 150)) . "...</em></small></p>";

        return $mock_analysis;
    }
}
