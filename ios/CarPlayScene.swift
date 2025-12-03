import CarPlay
import UIKit

class CarPlayScene: CPMapTemplate {
    private let assistantMessage = "MonGARS CarPlay entrypoint"

    override init() {
        let textTemplate = CPMessageListItem(text: assistantMessage, trailingText: nil)
        let section = CPMessageListSection(messages: [textTemplate])
        super.init()
        self.automaticallyHidesNavigationBar = false
        self.leadingNavigationBarButtons = []
        self.trailingNavigationBarButtons = []
        self.setTitles([assistantMessage], count: 1)
        self.setSections([section])
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }
}
