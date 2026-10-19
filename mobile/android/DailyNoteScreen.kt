package com.daymark.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.daymark.app.engine.TaskLifecycleEngine
import com.daymark.app.model.DailyDocument
import com.daymark.app.model.TaskItem

/**
 * Daymark Mobile Daily Notebook Screen (Jetpack Compose).
 * Provides full note-taking, heading organization, 1-tap historical completion,
 * and carry-forward aging alerts on mobile devices.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DailyNoteScreen(
    currentDate: String,
    document: DailyDocument,
    onToggleTaskDone: (String) -> Unit,
    onHistoricalDone: (String, String) -> Unit,
    onAddTask: (String, String) -> Unit
) {
    var showQuickAddDialog by remember { mutableStateOf(false) }
    var newTaskTitle by remember { mutableStateOf("") }
    var selectedHeading by remember { mutableStateOf("Work") }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(
                            text = "Today · $currentDate",
                            fontWeight = FontWeight.Bold,
                            fontSize = 18.sp
                        )
                        Text(
                            text = "Daily Markdown Notebook",
                            fontSize = 11.sp,
                            color = Color.Gray
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = Color(0xFF1C1917),
                    titleContentColor = Color.White
                )
            )
        },
        floatingActionButton = {
            FloatingActionButton(
                onClick = { showQuickAddDialog = true },
                containerColor = Color(0xFFD97706),
                contentColor = Color.White
            ) {
                Icon(Icons.Default.Add, contentDescription = "Add Task")
            }
        },
        containerColor = Color(0xFF141210)
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            item { Spacer(modifier = Modifier.height(8.dp)) }

            document.headings.forEach { section ->
                item {
                    Text(
                        text = "# ${section.name}",
                        fontWeight = FontWeight.Bold,
                        fontSize = 16.sp,
                        color = Color.White,
                        modifier = Modifier.padding(vertical = 4.dp)
                    )
                }

                items(section.items) { task ->
                    val isDone = task.status == "done"
                    val age = TaskLifecycleEngine.calculateTaskAge(task.createdDate, currentDate)

                    Card(
                        colors = CardDefaults.cardColors(containerColor = Color(0xFF1C1917)),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(modifier = Modifier.padding(12.dp)) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Checkbox(
                                    checked = isDone,
                                    onCheckedChange = { onToggleTaskDone(task.id) },
                                    colors = CheckboxDefaults.colors(
                                        checkedColor = Color(0xFF16A34A),
                                        uncheckedColor = Color(0xFF78716C)
                                    )
                                )

                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        text = task.title,
                                        color = if (isDone) Color.Gray else Color.White,
                                        textDecoration = if (isDone) TextDecoration.LineThrough else TextDecoration.None,
                                        fontWeight = FontWeight.Medium,
                                        fontSize = 14.sp
                                    )

                                    if (age > 0 && !isDone) {
                                        Text(
                                            text = "Carried forward · $age days",
                                            fontSize = 10.sp,
                                            color = if (age >= 7) Color(0xFFEF4444) else Color(0xFFF59E0B),
                                            fontWeight = FontWeight.SemiBold
                                        )
                                    }
                                }
                            }

                            // Historical completion action (PRD §7)
                            if (!isDone && (task.carriedFromDate != null || age > 0)) {
                                val prevDate = task.carriedFromDate ?: "Yesterday"
                                Button(
                                    onClick = { onHistoricalDone(task.id, prevDate) },
                                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF451A03)),
                                    modifier = Modifier
                                        .align(Alignment.End)
                                        .padding(top = 4.dp)
                                ) {
                                    Icon(Icons.Default.Check, contentDescription = null, modifier = Modifier.size(14.dp))
                                    Spacer(modifier = Modifier.width(4.dp))
                                    Text("Done on $prevDate", fontSize = 11.sp, color = Color(0xFFFDE68A))
                                }
                            }
                        }
                    }
                }
            }

            item { Spacer(modifier = Modifier.height(64.dp)) }
        }
    }

    if (showQuickAddDialog) {
        AlertDialog(
            onDismissRequest = { showQuickAddDialog = false },
            title = { Text("Quick Capture") },
            text = {
                OutlinedTextField(
                    value = newTaskTitle,
                    onValueChange = { newTaskTitle = it },
                    placeholder = { Text("Task or thought...") },
                    singleLine = true
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    if (newTaskTitle.isNotBlank()) {
                        onAddTask(newTaskTitle, selectedHeading)
                        newTaskTitle = ""
                        showQuickAddDialog = false
                    }
                }) {
                    Text("Add")
                }
            },
            dismissButton = {
                TextButton(onClick = { showQuickAddDialog = false }) {
                    Text("Cancel")
                }
            }
        )
    }
}
