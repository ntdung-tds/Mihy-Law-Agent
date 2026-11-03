"""Static safety and delivery contract checks for R0 UI preview, no actual legal services."""
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1] / 'web' / 'r0-preview'

class R0PreviewTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.html = (ROOT / 'index.html').read_text(encoding='utf-8')
        cls.css = (ROOT / 'styles.css').read_text(encoding='utf-8')
        cls.js = (ROOT / 'app.js').read_text(encoding='utf-8')

    def test_four_distinct_views(self):
        for name in ('overview', 'documents', 'assistant', 'research'):
            self.assertIn(f'data-panel="{name}"', self.html)
            self.assertIn(f'data-view="{name}"', self.html)

    def test_preview_is_clearly_labeled(self):
        for s in ('Dữ liệu minh họa', 'Chưa có', 'Bản xem trước'):
            self.assertIn(s, self.html + self.js)

    def test_responsive_and_reduced_motion(self):
        for s in ('@media(max-width:820px)', '@media(max-width:620px)', 'prefers-reduced-motion', 'safe-area-inset-bottom'):
            self.assertIn(s, self.css)

    def test_no_application_network_calls_or_credential_storage(self):
        for s in ('fetch(', 'XMLHttpRequest', 'localStorage', 'sessionStorage', 'WebSocket', 'eval(', 'innerHTML ='):
            self.assertNotIn(s, self.js)

    def test_local_file_selection_no_upload(self):
        self.assertIn('input type="file"', self.html)
        self.assertIn('Tệp không được tải lên', self.js)

    def test_modal_and_accessibility_controls(self):
        for s in ('aria-modal="true"', 'aria-live="polite"', 'aria-label="Điều hướng trên điện thoại"', 'type="submit"'):
            self.assertIn(s, self.html)
        self.assertIn("event.key === 'Escape'", self.js)


    def test_mobile_readability_r20_contract(self):
        """Regression guard for R20 mobile type and touch sizing (CSS contract only)."""
        marker = '/* R0 mobile legibility review R20:'
        self.assertIn(marker, self.css)
        overrides = self.css.split(marker, 1)[1]
        self.assertIn('@media(max-width:620px)', overrides)
        self.assertIn('@media(max-width:820px)', overrides)
        for selector, expected in (
            ('.hero p', 'font-size:14px'),
            ('.service-card p', 'font-size:13px'),
            ('.service-card strong', 'font-size:14px'),
            ('.recent-name', 'font-size:14px'),
            ('.recent-meta', 'font-size:12px'),
            ('.document-detail strong', 'font-size:14px'),
            ('.section-title', 'font-size:18px'),
            ('.mobile-demo-label', 'font-size:12px'),
            ('.bottom-item', 'font-size:12px'),
            ('.chat-composer textarea', 'font-size:16px'),
            ('.research-input input', 'font-size:16px'),
            ('.list-search input', 'font-size:16px'),
        ):
            import re
            self.assertRegex(overrides, rf'{re.escape(selector)}\s*\{{[^}}]*{re.escape(expected)}',
                             f'Missing readable mobile rule: {selector}')
        self.assertIn('.stats-grid{grid-template-columns:repeat(2,minmax(0,1fr))', overrides)
        for required in ('min-height:44px', 'width:44px;height:44px',
                         'safe-area-inset-bottom'):
            self.assertIn(required, overrides)

if __name__ == '__main__':
    unittest.main()