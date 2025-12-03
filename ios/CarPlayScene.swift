import CarPlay
import UIKit

class CarPlayScene: CPListTemplate {
    private static let assistantMessage = "MonGARS CarPlay entrypoint"

    init() {
        let textTemplate = CPMessageListItem(text: Self.assistantMessage, trailingText: nil)
        let section = CPMessageListSection(messages: [textTemplate])
        super.init(title: Self.assistantMessage, sections: [section])
        self.automaticallyHidesNavigationBar = false
        self.leadingNavigationBarButtons = []
        self.trailingNavigationBarButtons = []
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }
}
