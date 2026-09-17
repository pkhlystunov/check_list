// Архитектура глобального состояния приложения
let auditSession = {
    inspector: '',
    objectName: '',
    contractor: '',
    category: '',
    results: []
};

// Событие инициализации страницы: подтягиваем реестры
document.addEventListener("DOMContentLoaded", async function() {
    await loadGoogleSheetsRegistry();
});

async function loadGoogleSheetsRegistry() {
    const loadingEl = document.getElementById('setup-loading');
    const fieldsEl = document.getElementById('form-fields-wrapper');
    
    try {
        const response = await fetch(`${CONFIG.API_URL}?action=getSetupData`, {
            method: "GET",
            redirect: "follow"
        });
        
        const res = await response.json();
        if (!res.success) throw new Error(res.error || "Ошибка разбора JSON");
        
        // 1. Заполняем выпадающий список 1_Объекты
        const objectSelect = document.getElementById('object-select');
        res.objects.forEach(obj => {
            const opt = document.createElement('option');
            opt.value = obj.name; 
            opt.textContent = `${obj.id} | ${obj.name}`;
            objectSelect.appendChild(opt);
        });
        
        // 2. Заполняем выпадающий список 2_Подрядчики
        const contractorSelect = document.getElementById('contractor-select');
        res.contractors.forEach(contr => {
            const opt = document.createElement('option');
            opt.value = contr;
            opt.textContent = contr;
            contractorSelect.appendChild(opt);
        });
        
        // 3. Заполняем выпадающий список Направлений/Категорий из 3_Чек_лист
        const categorySelect = document.getElementById('category-select');
        res.categories.forEach(cat => {
            const opt = document.createElement('option');
            opt.value = cat;
            opt.textContent = cat;
            categorySelect.appendChild(opt);
        });
        
        // Переключаем интерфейс с лоадера на форму
        loadingEl.style.display = 'none';
        fieldsEl.style.display = 'block';
        
    } catch (error) {
        console.error("Ошибка загрузки реестров:", error);
        loadingEl.innerHTML = `<span style="color:var(--danger)"><b>Ошибка подключения к Google Таблицам:</b><br>${error.message}<br><br>Проверьте, что в Apps Script включен доступ для "Anyone".</span>`;
    }
}

function goToStep2() {
    const insp = document.getElementById('inspector').value.trim();
    const obj = document.getElementById('object-select').value;
    const contr = document.getElementById('contractor-select').value;
    
    if(!insp || !obj || !contr) {
        alert("Пожалуйста, заполните ФИО и выберите элементы из выпадающих списков Объектов и Подрядчиков!");
        return;
    }
    
    auditSession.inspector = insp;
    auditSession.objectName = obj;
    auditSession.contractor = contr;
    
    document.getElementById('meta-obj').textContent = obj;
    document.getElementById('meta-contr').textContent = contr;
    
    document.getElementById('step-1-form').style.display = 'none';
    document.getElementById('step-2-form').style.display = 'block';
}

function backToStep1() {
    document.getElementById('step-2-form').style.display = 'none';
    document.getElementById('step-1-form').style.display = 'block';
}

function backToStep2() {
    document.getElementById('step-3-checklist').style.display = 'none';
    document.getElementById('step-2-form').style.display = 'block';
}

async function startAudit() {
    const selectedCat = document.getElementById('category-select').value;
    auditSession.category = selectedCat || "Все разделы";
    auditSession.results = []; // Сброс ответов при новом запуске
    
    document.getElementById('step-2-form').style.display = 'none';
    
    const container = document.getElementById('questions-container');
    container.innerHTML = "<div class='loading-overlay'>Генерация вопросов по выбранному разделу...</div>";
    document.getElementById('step-3-checklist').style.display = 'block';
    
    // Обновляем мета-шапку
    document.getElementById('audit-meta-insp').textContent = auditSession.inspector;
    document.getElementById('audit-meta-obj').textContent = auditSession.objectName;
    document.getElementById('audit-meta-contr').textContent = auditSession.contractor;
    document.getElementById('audit-meta-cat').textContent = auditSession.category;

    try {
        let url = `${CONFIG.API_URL}?action=getChecklist`;
        if(selectedCat) {
            url += `&category=${encodeURIComponent(selectedCat)}`;
        }
        
        const response = await fetch(url, { method: "GET", redirect: "follow" });
        const result = await response.json();
        
        if (!result.success) throw new Error(result.error);
        
        container.innerHTML = "";
        
        if(result.data.length === 0) {
            container.innerHTML = "<p class='loading-overlay'>В выбранном разделе чек-листа нет вопросов.</p>";
            return;
        }
        
        result.data.forEach(q => {
            const safeQuestion = escapeHtml(q.question);
            const safeCategory = escapeHtml(q.category);
            
            container.innerHTML += `
                <div class="card" id="q-box-${q.id}">
                    <div class="badge">${safeCategory}</div>
                    <p style="margin: 5px 0 12px 0; font-size: 16px; line-height: 1.4;">${safeQuestion}</p>
                    \${q.normative ? `<div class="normative-text"><b>Норматив / Пункт правил:</b> \${escapeHtml(q.normative)}</div>` : ''}
                    
                    <div style="margin-top:15px;">
                        <button type="button" class="btn btn-success" onclick="setQuestionResult(${q.id}, 'Соответствует', '${safeQuestion}')">Соответствует</button>
                        <button type="button" class="btn btn-danger" onclick="setQuestionResult(${q.id}, 'Нарушение', '${safeQuestion}')">Нарушение</button>
                    </div>
                    <input type="text" id="comment-${q.id}" class="comment-box" placeholder="Опишите дефекты, нарушения и зафиксируйте сроки...">
                </div>
            `;
        });
        
    } catch(error) {
        console.error("Ошибка загрузки чек-листа:", error);
        container.innerHTML = `<div class='card' style='border-left-color:var(--danger); color:var(--danger);'><b>Ошибка:</b> ${error.message}</div>`;
    }
}

function setQuestionResult(id, status, questionText) {
    let item = auditSession.results.find(r => r.id === id);
    if (!item) {
        item = { id: id, question: questionText, status: status, comment: '' };
        auditSession.results.push(item);
    } else {
        item.status = status;
    }
    
    const commentInput = document.getElementById(`comment-${id}`);
    if (commentInput) {
        commentInput.style.display = status === 'Нарушение' ? 'block' : 'none';
    }
    
    const card = document.getElementById(`q-box-${id}`);
    card.style.borderLeftColor = status === 'Соответствует' ? 'var(--success)' : 'var(--danger)';
}

async function submitAudit() {
    if (auditSession.results.length === 0) {
        alert("Вы не ответили ни на один пункт чек-листа!");
        return;
    }
    
    // Синхронизируем комменты из инпутов
    auditSession.results.forEach(item => {
        const commentInput = document.getElementById(`comment-${item.id}`);
        if(commentInput) {
            item.comment = commentInput.value.trim();
        }
    });
    
    const btn = document.getElementById('submit-btn');
    btn.disabled = true;
    btn.innerText = "Идет запись в реестр проверок...";
    
    try {
        const response = await fetch(CONFIG.API_URL, {
            method: 'POST',
            body: JSON.stringify(auditSession),
            headers: { 'Content-Type': 'text/plain;charset=utf-8' }
        });
        
        alert('Успешно! Все данные внесены во вкладку "7_Реестр_Проверок".');
        location.reload();
        
    } catch(error) {
        console.error("Критическая ошибка при отправке:", error);
        alert("Не удалось отправить. Подробности смотрите в консоли F12.");
        btn.disabled = false;
        btn.innerText = "Отправить отчет в Реестр Проверок";
    }
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
