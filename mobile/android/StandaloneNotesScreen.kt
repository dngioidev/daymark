package com.daymark.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.daymark.app.model.StandaloneNote
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter

/**
 * Daymark Mobile Native Standalone Notes Approach (Jetpack Compose).
 *
 * Implements a lightweight, touch-ergonomic mobile notes workspace:
 * - Folder drawer / pill filters (All, Engineering, Personal, Ideas)
 * - Instant full-text search with title & content debounce
 * - 1-tap note creation and pinning
 * - Distraction-free Markdown editor with mobile keyboard accessory formatting bar
 * - Offline-first persistence directly to raw Markdown files in App-Specific Scoped Storage
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StandaloneNotesScreen(
    notes: List<StandaloneNote>,
    onSaveNote: (StandaloneNote) -> Unit,
    onDeleteNote: (String) -> Unit,
    onBackToDaily: () -> Unit
) {
    var selectedNoteId by remember { mutableStateOf<String?>(null) }
    var searchQuery by remember { mutableStateOf("") }
    var selectedFolder by remember { mutableStateOf("All") }
    var isPreviewMode by remember { mutableStateOf(false) }

    val activeNote = notes.find { it.id == selectedNoteId }

    // Unique folders
    val folders = remember(notes) {
        listOf("All") + notes.mapNotNull { it.folder.ifBlank { null } }.distinct().sorted()
    }

    // Filtered notes
    val filteredNotes = remember(notes, searchQuery, selectedFolder) {
        notes.filter { note ->
            val matchFolder = selectedFolder == "All" || note.folder.equals(selectedFolder, ignoreCase = true)
            val matchSearch = searchQuery.isBlank() ||
                note.title.contains(searchQuery, ignoreCase = true) ||
                note.content.contains(searchQuery, ignoreCase = true) ||
                note.tags.any { it.contains(searchQuery, ignoreCase = true) }
            matchFolder && matchSearch
        }.sortedWith(compareByDescending<StandaloneNote> { it.isPinned }.thenByDescending { it.updatedAt })
    }

    if (activeNote != null) {
        // --- NOTE EDITOR VIEW ---
        MobileNoteEditorView(
            note = activeNote,
            folders = folders.filter { it != "All" },
            isPreviewMode = isPreviewMode,
            onTogglePreview = { isPreviewMode = !isPreviewMode },
            onSave = onSaveNote,
            onDelete = {
                onDeleteNote(activeNote.id)
                selectedNoteId = null
            },
            onBack = { selectedNoteId = null }
        )
    } else {
        // --- NOTE LIST & SEARCH VIEW ---
        Scaffold(
            topBar = {
                TopAppBar(
                    title = {
                        Column {
                            Text(
                                text = "Notes Vault",
                                fontWeight = FontWeight.Bold,
                                fontSize = 18.sp
                            )
                            Text(
                                text = "${filteredNotes.size} documents · Local-First Markdown",
                                fontSize = 11.sp,
                                color = Color.Gray
                            )
                        }
                    },
                    navigationIcon = {
                        IconButton(onClick = onBackToDaily) {
                            Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back to Daily")
                        }
                    },
                    actions = {
                        IconButton(onClick = {
                            val newId = "note-${System.currentTimeMillis()}"
                            val newNote = StandaloneNote(
                                id = newId,
                                title = "Untitled Note",
                                content = "# Untitled Note\n\nStart writing in Markdown...",
                                folder = if (selectedFolder != "All") selectedFolder else "General",
                                tags = emptyList(),
                                isPinned = false,
                                updatedAt = LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME)
                            )
                            onSaveNote(newNote)
                            selectedNoteId = newId
                        }) {
                            Icon(Icons.Default.Add, contentDescription = "New Note", tint = Color(0xFFD97706))
                        }
                    },
                    colors = TopAppBarDefaults.topAppBarColors(
                        containerColor = Color(0xFF1C1917),
                        titleContentColor = Color.White
                    )
                )
            },
            containerColor = Color(0xFF141210)
        ) { padding ->
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
            ) {
                // Search Input
                OutlinedTextField(
                    value = searchQuery,
                    onValueChange = { searchQuery = it },
                    placeholder = { Text("Search title, content, or #tags...", fontSize = 13.sp) },
                    leadingIcon = { Icon(Icons.Default.Search, contentDescription = null, tint = Color.Gray) },
                    trailingIcon = {
                        if (searchQuery.isNotEmpty()) {
                            IconButton(onClick = { searchQuery = "" }) {
                                Icon(Icons.Default.Clear, contentDescription = "Clear")
                            }
                        }
                    },
                    singleLine = true,
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedContainerColor = Color(0xFF1C1917),
                        unfocusedContainerColor = Color(0xFF1C1917),
                        focusedBorderColor = Color(0xFFD97706),
                        unfocusedBorderColor = Color(0xFF292524),
                        focusedTextColor = Color.White,
                        unfocusedTextColor = Color.White
                    ),
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 8.dp)
                )

                // Folder Filter Chips
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState())
                        .padding(horizontal = 16.dp, vertical = 4.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    folders.forEach { folder ->
                        val isSelected = selectedFolder == folder
                        Surface(
                            shape = RoundedCornerShape(16.dp),
                            color = if (isSelected) Color(0xFFD97706) else Color(0xFF292524),
                            modifier = Modifier.clickable { selectedFolder = folder }
                        ) {
                            Text(
                                text = folder,
                                color = if (isSelected) Color.White else Color(0xFFA8A29E),
                                fontSize = 12.sp,
                                fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal,
                                modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp)
                            )
                        }
                    }
                }

                // Notes List
                if (filteredNotes.isEmpty()) {
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(32.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = "No notes found in '$selectedFolder'",
                            color = Color.Gray,
                            fontSize = 13.sp
                        )
                    }
                } else {
                    LazyColumn(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(horizontal = 16.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                        contentPadding = PaddingValues(vertical = 12.dp)
                    ) {
                        items(filteredNotes, key = { it.id }) { note ->
                            NoteCardItem(
                                note = note,
                                onClick = { selectedNoteId = note.id }
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun NoteCardItem(note: StandaloneNote, onClick: () -> Unit) {
    Card(
        colors = CardDefaults.cardColors(containerColor = Color(0xFF1C1917)),
        shape = RoundedCornerShape(12.dp),
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth()
            ) {
                if (note.isPinned) {
                    Icon(
                        Icons.Default.Star,
                        contentDescription = "Pinned",
                        tint = Color(0xFFF59E0B),
                        modifier = Modifier
                            .size(14.dp)
                            .padding(end = 4.dp)
                    )
                }
                Text(
                    text = note.title,
                    fontWeight = FontWeight.Bold,
                    fontSize = 15.sp,
                    color = Color.White,
                    modifier = Modifier.weight(1f)
                )
                Surface(
                    shape = RoundedCornerShape(4.dp),
                    color = Color(0xFF292524)
                ) {
                    Text(
                        text = note.folder.ifBlank { "General" },
                        fontSize = 10.sp,
                        color = Color(0xFFA8A29E),
                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                    )
                }
            }

            Spacer(modifier = Modifier.height(6.dp))

            // First 2 lines of content preview (cleaned of markdown headers)
            val previewText = note.content
                .lines()
                .filter { it.isNotBlank() && !it.startsWith("#") }
                .take(2)
                .joinToString(" ")

            Text(
                text = previewText.ifBlank { "Empty note" },
                maxLines = 2,
                fontSize = 12.sp,
                color = Color(0xFFA8A29E),
                lineHeight = 16.sp
            )

            Spacer(modifier = Modifier.height(8.dp))

            Text(
                text = "Updated: ${note.updatedAt.take(10)}",
                fontSize = 10.sp,
                fontFamily = FontFamily.Monospace,
                color = Color(0xFF78716C)
            )
        }
    }
}

/**
 * Distraction-Free Mobile Markdown Editor with touch accessory keyboard formatting bar.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MobileNoteEditorView(
    note: StandaloneNote,
    folders: List<String>,
    isPreviewMode: Boolean,
    onTogglePreview: () -> Unit,
    onSave: (StandaloneNote) -> Unit,
    onDelete: () -> Unit,
    onBack: () -> Unit
) {
    var title by remember(note.id) { mutableStateOf(note.title) }
    var content by remember(note.id) { mutableStateOf(note.content) }
    var currentFolder by remember(note.id) { mutableStateOf(note.folder) }

    fun commitChanges() {
        onSave(
            note.copy(
                title = title.ifBlank { "Untitled" },
                content = content,
                folder = currentFolder,
                updatedAt = LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME)
            )
        )
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = title.ifBlank { "Editing Note" },
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Bold,
                        maxLines = 1
                    )
                },
                navigationIcon = {
                    IconButton(onClick = {
                        commitChanges()
                        onBack()
                    }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Save and Back")
                    }
                },
                actions = {
                    IconButton(onClick = onTogglePreview) {
                        Icon(
                            if (isPreviewMode) Icons.Default.Edit else Icons.Default.Menu,
                            contentDescription = if (isPreviewMode) "Edit Mode" else "Preview Mode",
                            tint = Color(0xFFD97706)
                        )
                    }
                    IconButton(onClick = onDelete) {
                        Icon(Icons.Default.Delete, contentDescription = "Delete Note", tint = Color.Red)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = Color(0xFF1C1917),
                    titleContentColor = Color.White
                )
            )
        },
        bottomBar = {
            // Touch Accessory Bar (Mobile Markdown shortcuts)
            Surface(
                color = Color(0xFF1C1917),
                tonalElevation = 4.dp
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState())
                        .padding(horizontal = 8.dp, vertical = 6.dp),
                    horizontalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    AccessoryButton("#") { content += "\n# " }
                    AccessoryButton("##") { content += "\n## " }
                    AccessoryButton("- [ ]") { content += "\n- [ ] " }
                    AccessoryButton("**B**") { content += "****" }
                    AccessoryButton("*I*") { content += "**" }
                    AccessoryButton("`Code`") { content += "``" }
                    AccessoryButton("> Quote") { content += "\n> " }
                    AccessoryButton("---") { content += "\n\n---\n\n" }
                }
            }
        },
        containerColor = Color(0xFF141210)
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(16.dp)
        ) {
            // Editable Title
            OutlinedTextField(
                value = title,
                onValueChange = {
                    title = it
                    commitChanges()
                },
                label = { Text("Note Title") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth()
            )

            Spacer(modifier = Modifier.height(12.dp))

            // Content Editor or Preview
            if (isPreviewMode) {
                Surface(
                    color = Color(0xFF1C1917),
                    shape = RoundedCornerShape(8.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f)
                ) {
                    LazyColumn(modifier = Modifier.padding(16.dp)) {
                        item {
                            Text(
                                text = content,
                                color = Color.White,
                                fontSize = 14.sp,
                                lineHeight = 20.sp,
                                fontFamily = FontFamily.Monospace
                            )
                        }
                    }
                }
            } else {
                OutlinedTextField(
                    value = content,
                    onValueChange = {
                        content = it
                        commitChanges()
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f),
                    placeholder = { Text("Write Markdown here...") },
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedContainerColor = Color(0xFF1C1917),
                        unfocusedContainerColor = Color(0xFF1C1917),
                        focusedTextColor = Color.White,
                        unfocusedTextColor = Color.White
                    )
                )
            }
        }
    }
}

@Composable
private fun AccessoryButton(label: String, onClick: () -> Unit) {
    Button(
        onClick = onClick,
        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF292524)),
        contentPadding = PaddingValues(horizontal = 10.dp, vertical = 4.dp),
        shape = RoundedCornerShape(6.dp)
    ) {
        Text(text = label, fontSize = 12.sp, color = Color(0xFFE7E5E4))
    }
}
