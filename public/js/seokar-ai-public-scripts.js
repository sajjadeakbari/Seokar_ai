/**
 * SeoKar AI Admin Scripts
 *
 * Handles interactions within the SeoKar AI metabox in the post editor.
 */
(function ($) {
    'use strict';

    $(function () { // Shorthand for jQuery(document).ready(function($) {

        const $metaboxContent = $('#seokar-ai-metabox-content');
        if (!$metaboxContent.length) {
            // Metabox not present, do nothing.
            return;
        }

        const $resultsDiv = $metaboxContent.find('#seokar-ai-metabox-results');
        const $spinner = $metaboxContent.find('#seokar-ai-metabox-spinner');
        let originalPostTitle = ''; // To store the original title when editor loads
        let originalPostContent = ''; // To store original content

        // --- Helper Functions ---

        /**
         * Gets the current post title from the editor.
         * Handles both classic and Gutenberg (if possible, though Gutenberg is complex here).
         * @returns {string} The current post title.
         */
        function getCurrentPostTitle() {
            if ($('#titlewrap #title').length) { // Classic editor
                return $('#titlewrap #title').val();
            }
            // Basic Gutenberg attempt - more robust solution would use wp.data
            if (typeof wp !== 'undefined' && wp.data && wp.data.select('core/editor')) {
                try {
                    const title = wp.data.select('core/editor').getEditedPostAttribute('title');
                    return title || '';
                } catch (e) {
                    // Fallback if Gutenberg API fails or not available
                    console.warn('SeoKar AI: Could not get Gutenberg title directly, falling back to input (if exists).');
                }
            }
            // Fallback for other scenarios or if Gutenberg selector fails
            const $gutenbergTitleInput = $('.edit-post-visual-editor__post-title-wrapper input.editor-post-title__input');
            if ($gutenbergTitleInput.length) {
                return $gutenbergTitleInput.val();
            }
            return '';
        }

        /**
         * Gets the current post content from the editor.
         * Handles both classic (TinyMCE and text mode) and Gutenberg.
         * @returns {string} The current post content.
         */
        function getCurrentPostContent() {
            // Classic Editor (TinyMCE)
            if (typeof tinymce !== 'undefined' && tinymce.get('content') && tinymce.get('content').isVisible()) {
                return tinymce.get('content').getContent();
            }
            // Classic Editor (Text tab)
            if ($('#content').length && $('#content').is(':visible')) {
                return $('#content').val();
            }
            // Gutenberg Editor
            if (typeof wp !== 'undefined' && wp.data && wp.data.select('core/editor')) {
                try {
                    const content = wp.data.select('core/editor').getEditedPostAttribute('content');
                    return content || '';
                } catch (e) {
                    console.warn('SeoKar AI: Could not get Gutenberg content directly.');
                }
            }
            return ''; // Fallback
        }

        /**
         * Inserts text into the WordPress editor (Classic or Gutenberg).
         * @param {string} textToInsert The text to insert.
         * @param {string} targetField 'title', 'content', 'excerpt', 'tags', 'categories'.
         */
        function insertIntoEditor(textToInsert, targetField = 'content') {
            textToInsert = String(textToInsert).trim(); // Ensure it's a string and trim whitespace

            if (targetField === 'title') {
                if ($('#titlewrap #title').length) { // Classic
                    $('#titlewrap #title').val(textToInsert).trigger('input'); // Trigger input for WP to detect change
                } else if (typeof wp !== 'undefined' && wp.data && wp.data.dispatch('core/editor')) { // Gutenberg
                    try {
                        wp.data.dispatch('core/editor').editPost({ title: textToInsert });
                    } catch (e) { console.error('SeoKar AI: Failed to insert title in Gutenberg.', e); }
                }
            } else if (targetField === 'content') {
                if (typeof tinymce !== 'undefined' && tinymce.get('content') && tinymce.get('content').isVisible()) { // Classic TinyMCE
                    tinymce.get('content').insertContent(textToInsert);
                } else if ($('#content').length && $('#content').is(':visible')) { // Classic Text
                    const editor = document.getElementById('content');
                    const start = editor.selectionStart;
                    const end = editor.selectionEnd;
                    const text = editor.value;
                    editor.value = text.substring(0, start) + textToInsert + text.substring(end);
                    $(editor).trigger('input'); // For WP to detect change
                } else if (typeof wp !== 'undefined' && wp.blocks && wp.data && wp.data.dispatch('core/editor')) { // Gutenberg
                    try {
                        const { createBlock } = wp.blocks;
                        const { insertBlocks } = wp.data.dispatch('core/editor');
                        // Simple insertion as a new paragraph block. For more complex HTML, might need createBlockFromHTML
                        const block = createBlock('core/paragraph', { content: textToInsert });
                        insertBlocks(block);
                    } catch (e) { console.error('SeoKar AI: Failed to insert content in Gutenberg.', e); }
                }
            } else if (targetField === 'tags') {
                // For tags, it's usually a comma-separated list.
                // Classic editor uses '.tagadd' button or input with id 'new-tag-post_tag'
                // Gutenberg uses a component. This is more complex.
                // Simple approach for classic:
                if ($('#new-tag-post_tag').length) {
                    const currentTags = $('#new-tag-post_tag').val();
                    const newTags = currentTags ? currentTags + ', ' + textToInsert : textToInsert;
                    $('#new-tag-post_tag').val(newTags);
                    // Optionally, click the "Add" button if available and logic is clear
                    // $('.tagadd').click(); // This might add them one by one if textToInsert is multiple tags
                    alert(seokarAiAdmin.i18n.copied + " " + textToInsert + "\n" + __("Please add these tags manually or paste into the tag input field.", "seokar-ai"));
                } else {
                    // For Gutenberg, direct manipulation is harder. Inform user.
                    copyToClipboard(textToInsert);
                    alert(seokarAiAdmin.i18n.copied + " " + __("Please paste these tags into the tags field.", "seokar-ai"));
                }

            } else if (targetField === 'categories') {
                 // For categories, direct adding via JS is complex due to hierarchical nature and UI.
                 // Best to inform user to copy/paste or select manually.
                 copyToClipboard(textToInsert);
                 alert(seokarAiAdmin.i18n.copied + " " + __("Suggested categories copied. Please select them manually.", "seokar-ai"));
            }
            // TODO: Add more target fields like 'excerpt' if needed.
        }

        /**
         * Copies text to the clipboard.
         * @param {string} text The text to copy.
         * @returns {boolean} True if successful, false otherwise.
         */
        async function copyToClipboard(text) {
            if (!navigator.clipboard) {
                // Fallback for older browsers
                try {
                    const textArea = document.createElement("textarea");
                    textArea.value = text;
                    textArea.style.position = "fixed"; //avoid scrolling to bottom
                    document.body.appendChild(textArea);
                    textArea.focus();
                    textArea.select();
                    document.execCommand('copy');
                    document.body.removeChild(textArea);
                    return true;
                } catch (err) {
                    console.error('SeoKar AI: Fallback copy to clipboard failed', err);
                    return false;
                }
            }
            try {
                await navigator.clipboard.writeText(text);
                return true;
            } catch (err) {
                console.error('SeoKar AI: Could not copy text to clipboard: ', err);
                return false;
            }
        }


        // --- Event Handlers ---

        // Handle click on action buttons within the metabox
        $metaboxContent.on('click', '.seokar-ai-action-btn', function (e) {
            e.preventDefault();
            const $button = $(this);
            const actionType = $button.data('action');

            // Confirm for potentially destructive actions
            if (actionType === 'generate_full_content') {
                if (!confirm(seokarAiAdmin.i18n.confirm_generate_full_content)) {
                    return;
                }
            }

            const currentTitle = getCurrentPostTitle();
            const currentContent = getCurrentPostContent();

            if (!currentTitle && (actionType === 'generate_content_outline' || actionType === 'generate_full_content')) {
                 $resultsDiv.html('<p class="seokar-ai-error">' + __('Please enter a title first for this action.', 'seokar-ai') + '</p>');
                 return;
            }
            if (!currentContent && (actionType === 'suggest_title' || actionType === 'suggest_keywords')) {
                 // Allow title/keyword suggestion even without content, but it might be less effective
                 // $resultsDiv.html('<p class="seokar-ai-error">' + seokarAiAdmin.i18n.no_content_selected + '</p>');
                 // return;
            }


            $spinner.css('visibility', 'visible');
            $resultsDiv.html('<p>' + seokarAiAdmin.i18n.processing + '</p>');
            $button.prop('disabled', true).addClass('disabled');
            $('.seokar-ai-action-btn').not($button).prop('disabled', true).addClass('disabled'); // Disable all buttons

            $.ajax({
                url: seokarAiAdmin.ajax_url,
                type: 'POST',
                data: {
                    action: 'seokar_ai_editor_suggestion', // WP AJAX action defined in PHP
                    nonce: seokarAiAdmin.nonce,
                    post_id: seokarAiAdmin.post_id,
                    action_type: actionType,
                    current_title: currentTitle,
                    current_content: currentContent
                },
                dataType: 'json', // Expect JSON response from server
                success: function (response) {
                    if (response.success && response.data && response.data.html) {
                        let htmlOutput = response.data.html;
                        // Add action buttons to the results
                        htmlOutput += '<div class="seokar-ai-result-actions" style="margin-top:10px;">';
                        if (actionType === 'suggest_title') {
                            htmlOutput += '<button type="button" class="button button-small seokar-ai-insert-btn" data-target="title">' + seokarAiAdmin.i18n.insert_into_editor + ' (' + __('Title', 'seokar-ai') + ')</button> ';
                        } else if (actionType === 'generate_content_outline' || actionType === 'generate_full_content') {
                            htmlOutput += '<button type="button" class="button button-small seokar-ai-insert-btn" data-target="content">' + seokarAiAdmin.i18n.insert_into_editor + ' ('+ __('Content', 'seokar-ai') + ')</button> ';
                        } else if (actionType === 'suggest_keywords' || actionType === 'suggest_tags') {
                             htmlOutput += '<button type="button" class="button button-small seokar-ai-insert-btn" data-target="tags">' + __('Use as Tags', 'seokar-ai') + '</button> ';
                        } else if (actionType === 'suggest_categories') {
                             htmlOutput += '<button type="button" class="button button-small seokar-ai-copy-btn">' + seokarAiAdmin.i18n.copy_to_clipboard + '</button> ';
                             // No direct insert for categories, too complex.
                        }

                        // Always offer a general copy button if no specific insert is offered or in addition
                        if (actionType !== 'suggest_categories'){ // Categories already has copy
                             htmlOutput += '<button type="button" class="button button-small seokar-ai-copy-btn">' + seokarAiAdmin.i18n.copy_to_clipboard + '</button>';
                        }
                        htmlOutput += '</div>';
                        $resultsDiv.html(htmlOutput);
                    } else {
                        const errorMessage = response.data || seokarAiAdmin.i18n.error_generic;
                        $resultsDiv.html('<p class="seokar-ai-error">' + errorMessage + '</p>');
                         console.error('SeoKar AI AJAX Error:', response);
                    }
                },
                error: function (jqXHR, textStatus, errorThrown) {
                    $resultsDiv.html('<p class="seokar-ai-error">' + seokarAiAdmin.i18n.error_generic + ' (' + textStatus + ': ' + errorThrown + ')</p>');
                    console.error('SeoKar AI AJAX Call Failed:', textStatus, errorThrown, jqXHR.responseText);
                },
                complete: function () {
                    $spinner.css('visibility', 'hidden');
                    // Re-enable the clicked button and other buttons
                    $button.prop('disabled', false).removeClass('disabled');
                    $('.seokar-ai-action-btn').not($button).prop('disabled', false).removeClass('disabled');
                }
            });
        });

        // Handle click on "Insert into Editor" or "Use as Tags" buttons in results
        $resultsDiv.on('click', '.seokar-ai-insert-btn', function() {
            const $button = $(this);
            const target = $button.data('target');
            // Get the main content of the suggestion, excluding the action buttons and debug info.
            // A more robust way would be to wrap the actual suggestion in a specific element.
            let textToInsert = $resultsDiv.clone().find('.seokar-ai-result-actions, small').remove().end().text().trim();

            if (target === 'title') {
                // For titles, AI often returns a list. We might want to let user pick or take the first.
                // For simplicity, let's assume the AI returns one title or the user wants the first one from a list.
                // If the response is a list (e.g., <li>...</li>), try to extract the first item's text.
                const $lis = $resultsDiv.find('li');
                if ($lis.length > 0) {
                    textToInsert = $lis.first().text().trim();
                } else { // If not a list, use the whole text
                    textToInsert = $resultsDiv.clone().find('.seokar-ai-result-actions, small').remove().end().text().trim();
                }
            }


            if (textToInsert) {
                insertIntoEditor(textToInsert, target);
                $button.text(seokarAiAdmin.i18n.copied).prop('disabled', true); // Give feedback
                setTimeout(function() { $button.text(seokarAiAdmin.i18n.insert_into_editor + (target === 'title' ? ' (Title)' : ' (Content)')).prop('disabled', false); }, 2000);
            }
        });

        // Handle click on "Copy to Clipboard" buttons in results
        $resultsDiv.on('click', '.seokar-ai-copy-btn', async function() {
            const $button = $(this);
            // Get the main content of the suggestion, excluding the action buttons and debug info
            const textToCopy = $resultsDiv.clone().find('.seokar-ai-result-actions, small').remove().end().text().trim();

            if (textToCopy) {
                const success = await copyToClipboard(textToCopy);
                if (success) {
                    const originalText = $button.text();
                    $button.text(seokarAiAdmin.i18n.copied).prop('disabled', true);
                    setTimeout(function() { $button.text(originalText).prop('disabled', false); }, 2000);
                } else {
                    alert(__('Failed to copy. Please try manually.', 'seokar-ai'));
                }
            }
        });

        // Make sure nonce is updated if the post ID changes (e.g. after first save of a new post)
        // This is a bit advanced and might need integration with WordPress save events.
        // For now, the nonce created on page load is used. If a new post is saved,
        // the user might need to reload the page for the metabox nonce to be perfectly in sync
        // with the new post_id for subsequent AJAX calls, though the 'new_post' nonce should generally work.
        // $(document).on('wp-saving-post', function(event, jqXHR, data) {
            // Potentially update seokarAiAdmin.nonce and seokarAiAdmin.post_id here if needed and possible
            // This requires deeper digging into WP core JS events.
        // });
        // For Gutenberg, wp.data.subscribe could be used to listen for post save and update nonce.
        if (typeof wp !== 'undefined' && wp.data && wp.data.subscribe) {
            let currentPostId = seokarAiAdmin.post_id;
            const unsubscribe = wp.data.subscribe(() => {
                const newPostId = wp.data.select('core/editor')?.getCurrentPostId?.();
                if (newPostId && newPostId !== currentPostId) {
                    // Post ID has changed (likely a new post was saved)
                    // console.log('SeoKar AI: Post ID changed from', currentPostId, 'to', newPostId);
                    currentPostId = newPostId;
                    seokarAiAdmin.post_id = newPostId; // Update our global JS object
                    // Regenerate nonce. This requires an AJAX call or a pre-loaded list of nonces which isn't practical.
                    // The safest bet is that the initial nonce ('seokar_ai_metabox_action_new_post')
                    // or the one generated with the initial post ID is still validated correctly on the server
                    // if the context (new post vs existing post) is handled.
                    // For now, we'll rely on the initial nonce and server-side flexibility.
                    // A more robust solution would be to re-fetch the nonce if the post_id changes from 0.
                }
            });
            // Note: Remember to unsubscribe if the component/metabox is unmounted, though for classic metaboxes it's usually not an issue.
        }

    }); // End document.ready
})(jQuery);
