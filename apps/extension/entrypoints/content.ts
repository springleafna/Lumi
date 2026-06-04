export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    // MVP2 reads page content on demand from the popup via scripting.
  },
});
