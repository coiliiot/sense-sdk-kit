import SwiftUI

@main
struct SenseSDKDemoApp: App {
    @StateObject private var viewModel = DemoViewModel()

    var body: some Scene {
        WindowGroup {
            ContentView(viewModel: viewModel)
        }
    }
}
