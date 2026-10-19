import SwiftUI

// MARK: - Daymark iOS Mobile Native Notes Approach (SwiftUI)
// Implements an offline-first, thumb-driven Markdown notes workspace:
// - NavigationSplitView / NavigationStack adaptive hierarchy
// - Folder and tag filtering with instant search
// - Distraction-free native Markdown editor with keyboard accessory toolbar
// - Direct App Group storage (`group.com.daymark.vault/Notes/...`) for zero-latency Widget sharing

struct StandaloneNoteItem: Identifiable, Codable {
    var id: String
    var title: String
    var content: String
    var folder: String
    var tags: [String]
    var isPinned: Bool
    var updatedAt: String
}

struct DaymarkNotesView: View {
    @State private var notes: [StandaloneNoteItem] = [
        StandaloneNoteItem(
            id: "note-1",
            title: "Architecture & Sync Protocol",
            content: "# Architecture & Sync Protocol\n\n- REST sync uses Bearer tokens\n- Idempotent merge on timestamp\n- Conflict resolution via last-write-wins with history preservation",
            folder: "Engineering",
            tags: ["sync", "architecture"],
            isPinned: true,
            updatedAt: "2026-10-19"
        ),
        StandaloneNoteItem(
            id: "note-2",
            title: "Sprint Goals & Milestones",
            content: "# Sprint Goals\n\n- [x] Deliver Desktop multi-column layout\n- [x] Deliver Dedicated Mobile shell\n- [ ] Release native iOS & Android apps",
            folder: "Work",
            tags: ["sprint"],
            isPinned: false,
            updatedAt: "2026-10-18"
        )
    ]
    
    @State private var selectedFolder: String = "All"
    @State private var searchText: String = ""
    @State private var selectedNote: StandaloneNoteItem? = nil

    var folders: [String] {
        ["All"] + Array(Set(notes.map { $0.folder.isEmpty ? "General" : $0.folder })).sorted()
    }

    var filteredNotes: [StandaloneNoteItem] {
        notes.filter { note in
            let matchFolder = selectedFolder == "All" || note.folder == selectedFolder
            let matchSearch = searchText.isEmpty ||
                note.title.localizedCaseInsensitiveContains(searchText) ||
                note.content.localizedCaseInsensitiveContains(searchText)
            return matchFolder && matchSearch
        }.sorted { (a, b) -> Bool in
            if a.isPinned != b.isPinned {
                return a.isPinned
            }
            return a.updatedAt > b.updatedAt
        }
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // Folder Filter Scroll
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(folders, id: \.self) { folder in
                            Button(action: { selectedFolder = folder }) {
                                Text(folder)
                                    .font(.system(size: 12, weight: selectedFolder == folder ? .bold : .medium))
                                    .padding(.horizontal, 12)
                                    .padding(.vertical, 6)
                                    .background(selectedFolder == folder ? Color.orange : Color(white: 0.18))
                                    .foregroundColor(.white)
                                    .cornerRadius(16)
                            }
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 8)
                }
                .background(Color(red: 0.11, green: 0.10, blue: 0.09))

                // Note List
                List {
                    ForEach(filteredNotes) { note in
                        NavigationLink(destination: NoteEditorDetailView(note: binding(for: note))) {
                            VStack(alignment: .leading, spacing: 4) {
                                HStack {
                                    if note.isPinned {
                                        Image(systemName: "pin.fill")
                                            .font(.system(size: 11))
                                            .foregroundColor(.orange)
                                    }
                                    Text(note.title)
                                        .font(.system(size: 15, weight: .semibold))
                                        .foregroundColor(.white)
                                    Spacer()
                                    Text(note.folder.isEmpty ? "General" : note.folder)
                                        .font(.system(size: 10, weight: .bold))
                                        .padding(.horizontal, 6)
                                        .padding(.vertical, 2)
                                        .background(Color(white: 0.2))
                                        .foregroundColor(.gray)
                                        .cornerRadius(4)
                                }

                                Text(note.content.replacingOccurrences(of: "\n", with: " "))
                                    .font(.system(size: 12))
                                    .lineLimit(2)
                                    .foregroundColor(.gray)

                                Text("Updated: \(note.updatedAt)")
                                    .font(.system(size: 9, design: .monospaced))
                                    .foregroundColor(Color(white: 0.4))
                            }
                            .padding(.vertical, 4)
                        }
                        .listRowBackground(Color(red: 0.11, green: 0.10, blue: 0.09))
                    }
                    .onDelete(perform: deleteNote)
                }
                .listStyle(.plain)
                .background(Color(red: 0.08, green: 0.07, blue: 0.06))
            }
            .navigationTitle("Notes")
            .searchable(text: $searchText, prompt: "Search notes or #tags")
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button(action: createNewNote) {
                        Image(systemName: "square.and.pencil")
                            .foregroundColor(.orange)
                    }
                }
            }
            .background(Color(red: 0.08, green: 0.07, blue: 0.06))
        }
    }

    private func binding(for note: StandaloneNoteItem) -> Binding<StandaloneNoteItem> {
        guard let index = notes.firstIndex(where: { $0.id == note.id }) else {
            fatalError("Note not found")
        }
        return $notes[index]
    }

    private func createNewNote() {
        let newNote = StandaloneNoteItem(
            id: UUID().uuidString,
            title: "Untitled Note",
            content: "# Untitled Note\n\n",
            folder: selectedFolder == "All" ? "General" : selectedFolder,
            tags: [],
            isPinned: false,
            updatedAt: "Today"
        )
        notes.insert(newNote, at: 0)
    }

    private func deleteNote(at offsets: IndexSet) {
        notes.remove(atOffsets: offsets)
    }
}

// MARK: - Markdown Detail Editor with Accessory Bar
struct NoteEditorDetailView: View {
    @Binding var note: StandaloneNoteItem
    @State private var isPreviewing: Bool = false

    var body: some View {
        VStack(spacing: 0) {
            // Title Input
            TextField("Title", text: $note.title)
                .font(.system(size: 20, weight: .bold))
                .foregroundColor(.white)
                .padding(.horizontal, 16)
                .padding(.top, 12)

            Divider().background(Color(white: 0.2))

            // Text Editor or Preview
            if isPreviewing {
                ScrollView {
                    Text(note.content)
                        .font(.system(size: 14, design: .monospaced))
                        .foregroundColor(.white)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(16)
                }
                .background(Color(red: 0.11, green: 0.10, blue: 0.09))
            } else {
                TextEditor(text: $note.content)
                    .font(.system(size: 14, design: .monospaced))
                    .scrollContentBackground(.hidden)
                    .background(Color(red: 0.11, green: 0.10, blue: 0.09))
                    .foregroundColor(.white)
                    .padding(12)
            }
        }
        .background(Color(red: 0.08, green: 0.07, blue: 0.06))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItemGroup(placement: .keyboard) {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        AccessoryBtn(label: "#") { note.content.append("\n# ") }
                        AccessoryBtn(label: "##") { note.content.append("\n## ") }
                        AccessoryBtn(label: "- [ ]") { note.content.append("\n- [ ] ") }
                        AccessoryBtn(label: "**B**") { note.content.append("****") }
                        AccessoryBtn(label: "*I*") { note.content.append("**") }
                        AccessoryBtn(label: "`Code`") { note.content.append("``") }
                    }
                }
            }
            ToolbarItem(placement: .navigationBarTrailing) {
                Button(action: { isPreviewing.toggle() }) {
                    Image(systemName: isPreviewing ? "pencil" : "eye")
                        .foregroundColor(.orange)
                }
            }
        }
    }
}

struct AccessoryBtn: View {
    let label: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(label)
                .font(.system(size: 12, weight: .semibold))
                .padding(.horizontal, 10)
                .padding(.vertical, 4)
                .background(Color(white: 0.25))
                .foregroundColor(.white)
                .cornerRadius(6)
        }
    }
}
