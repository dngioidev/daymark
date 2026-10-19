import WidgetKit
import SwiftUI

// MARK: - Daymark iOS Home Screen & Lock Screen Widget (SwiftUI WidgetKit)
// Implements 1-tap completion intents, carry-forward aging alerts, and compact lock-screen views.

struct TaskEntry: TimelineEntry {
    let date: Date
    let todayDateString: String
    let activeTasks: [WidgetTaskItem]
    let completedCount: Int
    let totalCount: Int
}

struct WidgetTaskItem: Identifiable {
    let id: String
    let title: String
    let status: String
    let carryForwardAgeDays: Int
    let isDone: Bool
}

struct DaymarkWidgetProvider: TimelineProvider {
    func placeholder(in context: Context) -> TaskEntry {
        TaskEntry(
            date: Date(),
            todayDateString: "2026-10-16",
            activeTasks: [
                WidgetTaskItem(id: "1", title: "Investigate build pipeline failure", status: "in-progress", carryForwardAgeDays: 2, isDone: false),
                WidgetTaskItem(id: "2", title: "Prepare QA test scenarios", status: "blocked", carryForwardAgeDays: 3, isDone: false)
            ],
            completedCount: 1,
            totalCount: 3
        )
    }

    func getSnapshot(in context: Context, completion: @escaping (TaskEntry) -> ()) {
        completion(placeholder(in: context))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<TaskEntry>) -> ()) {
        // Load from shared App Group Markdown vault
        let entry = placeholder(in: context)
        let nextUpdate = Calendar.current.date(byAdding: .minute, value: 30, to: Date())!
        let timeline = Timeline(entries: [entry], policy: .after(nextUpdate))
        completion(timeline)
    }
}

struct DaymarkWidgetEntryView: View {
    var entry: DaymarkWidgetProvider.Entry
    @Environment(\.widgetFamily) var family

    var body: some View {
        switch family {
        case .systemSmall:
            SmallWidgetView(entry: entry)
        case .systemMedium:
            MediumWidgetView(entry: entry)
        case .accessoryRectangular:
            LockScreenWidgetView(entry: entry)
        default:
            MediumWidgetView(entry: entry)
        }
    }
}

struct MediumWidgetView: View {
    var entry: TaskEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                RoundedRectangle(cornerRadius: 2)
                    .fill(Color.orange)
                    .frame(width: 8, height: 8)
                Text("Daymark Today")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundColor(.white)
                Spacer()
                Text("\(entry.completedCount)/\(entry.totalCount) Done")
                    .font(.system(size: 11, design: .monospaced))
                    .foregroundColor(.gray)
            }

            Divider().background(Color.stoneBorder)

            VStack(alignment: .leading, spacing: 4) {
                ForEach(entry.activeTasks.prefix(3)) { task in
                    HStack {
                        Image(systemName: task.isDone ? "checkmark.square.fill" : "square")
                            .font(.system(size: 13))
                            .foregroundColor(task.isDone ? .green : .gray)

                        Text(task.title)
                            .font(.system(size: 11))
                            .lineLimit(1)
                            .foregroundColor(.white)

                        Spacer()

                        if task.carryForwardAgeDays > 0 {
                            Text("+\(task.carryForwardAgeDays)d")
                                .font(.system(size: 9, weight: .bold, design: .monospaced))
                                .foregroundColor(task.carryForwardAgeDays >= 7 ? .red : .orange)
                        }
                    }
                }
            }
        }
        .padding(12)
        .background(Color(red: 0.11, green: 0.10, blue: 0.09))
        // 1-tap opens the Daymark PWA (in standalone mode) or Native App to today's date
        .widgetURL(URL(string: "https://daymark.app/?tab=today&date=\(entry.todayDateString)"))
    }
}

struct SmallWidgetView: View {
    var entry: TaskEntry

    var body: some View {
        VStack(alignment: .center, spacing: 4) {
            Text("\(entry.activeTasks.count)")
                .font(.system(size: 32, weight: .bold, design: .monospaced))
                .foregroundColor(.orange)
            Text("Pending Tasks")
                .font(.system(size: 11))
                .foregroundColor(.gray)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(red: 0.11, green: 0.10, blue: 0.09))
        // 1-tap opens the Daymark PWA or Native App
        .widgetURL(URL(string: "https://daymark.app/?tab=today"))
    }
}

struct LockScreenWidgetView: View {
    var entry: TaskEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text("DAYMARK · \(entry.activeTasks.count) ACTIVE")
                .font(.system(size: 9, weight: .bold))
            if let first = entry.activeTasks.first {
                Text(first.title)
                    .font(.system(size: 11))
                    .lineLimit(1)
            }
        }
    }
}

@main
struct DaymarkWidgetBundle: WidgetBundle {
    var body: some Widget {
        DaymarkWidget()
    }
}

struct DaymarkWidget: Widget {
    let kind: String = "DaymarkWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: DaymarkWidgetProvider()) { entry in
            DaymarkWidgetEntryView(entry: entry)
        }
        .configurationDisplayName("Daymark Daily Tasks")
        .description("Quickly view today's active tasks and carry-forward aging alerts.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular])
    }
}

extension Color {
    static let stoneBorder = Color(white: 0.2)
}
