import SwiftUI
import WebKit

/// Thin shell around the deployed web app whose sole job is real haptics:
/// the page posts {tick|success} to the `haptic` message handler and we
/// drive the Taptic Engine. Everything else (game, accounts, sharing)
/// stays in the web app, so this shell never needs updating for features.
@main
struct WordHuntLoungeApp: App {
    var body: some Scene {
        WindowGroup {
            WebShell()
                .ignoresSafeArea()
                .preferredColorScheme(.dark)
        }
    }
}

struct WebShell: UIViewRepresentable {
    static let appURL = URL(string: "https://word-hunt-lounge.mwaeas.workers.dev")!

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.userContentController.add(context.coordinator, name: "haptic")
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.scrollView.bounces = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.isOpaque = false
        // matches --green-lo so load/overscroll never flashes white
        webView.backgroundColor = UIColor(red: 0.055, green: 0.369, blue: 0.220, alpha: 1)
        webView.allowsBackForwardNavigationGestures = false
        webView.load(URLRequest(url: Self.appURL))
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}

    final class Coordinator: NSObject, WKScriptMessageHandler {
        private let tick = UIImpactFeedbackGenerator(style: .light)
        private let success = UINotificationFeedbackGenerator()

        override init() {
            super.init()
            tick.prepare()
            success.prepare()
        }

        func userContentController(
            _ userContentController: WKUserContentController,
            didReceive message: WKScriptMessage
        ) {
            guard message.name == "haptic" else { return }
            switch message.body as? String {
            case "success":
                success.notificationOccurred(.success)
                success.prepare()
            default:
                tick.impactOccurred(intensity: 0.75)
                tick.prepare() // keep the Taptic Engine warm for the next tile
            }
        }
    }
}
