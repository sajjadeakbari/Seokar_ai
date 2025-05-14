/**
 * SeoKar AI Public Scripts
 *
 * Handles interactions for the AI suggestion icon and modal on the front-end
 * for logged-in administrators and editors.
 */
(function ($) {
    'use strict';

    $(function () { // Shorthand for jQuery(document).ready(function($) {

        const $triggerButton = $('#seokar-ai-public-trigger-btn');
        const $modal = $('#seokar-ai-public-modal');
        const $modalBody = $modal.find('#seokar-ai-public-modal-body');
        const $modalSpinner = $modal.find('#seokar-ai-public-modal-spinner');
        const $modalCloseButton = $modal.find('#seokar-ai-public-modal-close');

        // If the trigger button doesn't exist, do nothing further.
        if (!$triggerButton.length) {
            return;
        }

        // --- Event Handlers ---

        // 1. Handle click on the trigger button
        $triggerButton.on('click', function () {
            const postId = $(this).data('postid');

            if (!postId) {
                console.error('SeoKar AI: Post ID not found on trigger button.');
                $modalBody.html('<p class="seokar-ai-error">' + seokarAiPublic.i18n.error_generic + ' (No Post ID)</p>');
                $modal.css('display', 'flex'); // Show modal even with error to inform user
                return;
            }

            // Show modal and spinner, set initial loading message
            $modal.css('display', 'flex'); // Use flex for vertical centering of the modal content
            $modalSpinner.css('visibility', 'visible').addClass('is-active');
            $modalBody.html('<p>' + seokarAiPublic.i18n.loading + '</p>');

            $.ajax({
                url: seokarAiPublic.ajax_url,
                type: 'POST',
                data: {
                    action: 'seokar_ai_public_suggestion', // WP AJAX action
                    nonce: seokarAiPublic.nonce,
                    post_id: postId
                },
                dataType: 'json',
                success: function (response) {
                    if (response.success && response.data && response.data.html) {
                        $modalBody.html(response.data.html);
                    } else {
                        const errorMessage = (response.data && response.data.message) ? response.data.message : (response.data || seokarAiPublic.i18n.error_generic);
                        $modalBody.html('<p class="seokar-ai-error">' + errorMessage + '</p>');
                        console.error('SeoKar AI Public AJAX Error:', response);
                    }
                },
                error: function (jqXHR, textStatus, errorThrown) {
                    $modalBody.html('<p class="seokar-ai-error">' + seokarAiPublic.i18n.error_generic + ' (' + textStatus + ': ' + errorThrown + ')</p>');
                    console.error('SeoKar AI Public AJAX Call Failed:', textStatus, errorThrown, jqXHR.responseText);
                },
                complete: function () {
                    $modalSpinner.css('visibility', 'hidden').removeClass('is-active');
                }
            });
        });

        // 2. Handle click on the modal close button
        $modalCloseButton.on('click', function () {
            $modal.hide();
        });

        // 3. Handle click outside the modal content to close it (optional but good UX)
        $modal.on('click', function (e) {
            // Check if the click target is the modal background itself, not its children
            if ($(e.target).is($modal)) {
                $modal.hide();
            }
        });

        // 4. Handle 'Escape' key press to close the modal
        $(document).on('keydown', function (e) {
            if (e.key === "Escape" || e.key === "Esc") { // Check for Escape key
                if ($modal.is(':visible')) {
                    $modal.hide();
                }
            }
        });

    }); // End document.ready
})(jQuery);
