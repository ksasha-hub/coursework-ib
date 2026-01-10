mod models;
mod utils;

use actix_web::{web, App, HttpServer, HttpResponse, Responder};
use actix_cors::Cors;
use sea_orm::*;
use serde::{Deserialize, Serialize};
use models::{user, document, audit, comment};
use utils::crypto_ffi;
use std::env;
use std::time::Duration;
use tokio::time::sleep;
use chrono::Local;

#[derive(Deserialize)]
struct RegReq { username: String, password: String, full_name: String }
#[derive(Deserialize)]
struct LoginReq { username: String, password: String }
#[derive(Deserialize)]
struct DocReq { title: String, content: String, username: String }
#[derive(Deserialize)]
struct CommentReq { doc_id: i32, text: String, username: String }

#[derive(Deserialize)]
struct UpdateUserReq { full_name: String, username: String, role: String }

async fn log_audit(db: &DatabaseConnection, username: String, action: &str, details: &str) {
    let now = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let safe_details = if details.len() > 500 { format!("{}...", &details[..500]) } else { details.to_string() };
    
    let log = audit::ActiveModel {
        username: Set(username),
        action: Set(action.to_string()),
        details: Set(safe_details),
        created_at: Set(now),
        ..Default::default()
    };
    let _ = audit::Entity::insert(log).exec(db).await;
}

async fn register(db: web::Data<DatabaseConnection>, req: web::Json<RegReq>) -> impl Responder {
    let role = if req.username.contains("admin") { "admin" } else { "user" };
    let now = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let new_user = user::ActiveModel {
        username: Set(req.username.clone()),
        password: Set(req.password.clone()),
        full_name: Set(req.full_name.clone()),
        role: Set(role.to_string()),
        created_at: Set(now),
        ..Default::default()
    };
    match user::Entity::insert(new_user).exec(db.get_ref()).await {
        Ok(_) => {
            log_audit(db.get_ref(), req.username.clone(), "REGISTER", "New user registered").await;
            HttpResponse::Ok().json("Registered")
        },
        Err(_) => HttpResponse::BadRequest().body("User exists")
    }
}

async fn login(db: web::Data<DatabaseConnection>, req: web::Json<LoginReq>) -> impl Responder {
    let u = user::Entity::find().filter(user::Column::Username.eq(&req.username)).one(db.get_ref()).await.unwrap();
    if let Some(user) = u {
        if user.password == req.password {
            log_audit(db.get_ref(), user.username.clone(), "LOGIN", "Login successful").await;
            return HttpResponse::Ok().json(serde_json::json!({"token": "jwt", "user": user}));
        }
    }
    HttpResponse::Unauthorized().body("Invalid")
}

async fn create_doc(db: web::Data<DatabaseConnection>, req: web::Json<DocReq>) -> impl Responder {
    let encrypted = crypto_ffi::encrypt(&req.content);
    let doc = document::ActiveModel {
        title: Set(req.title.clone()),
        content_encrypted: Set(encrypted),
        owner_name: Set(req.username.clone()),
        ..Default::default()
    };
    let res = document::Entity::insert(doc).exec(db.get_ref()).await.unwrap();
    log_audit(db.get_ref(), req.username.clone(), "CREATE_DOC", &format!("ID: {}", res.last_insert_id)).await;
    HttpResponse::Ok().json("Created")
}

async fn get_docs(db: web::Data<DatabaseConnection>) -> impl Responder {
    let docs = document::Entity::find().all(db.get_ref()).await.unwrap();
    let mut result = Vec::new();
    for d in docs {
        let decrypted = crypto_ffi::decrypt(&d.content_encrypted);
        result.push(serde_json::json!({
            "id": d.id, "title": d.title, "content": decrypted, "author": d.owner_name
        }));
    }
    HttpResponse::Ok().json(result)
}

async fn delete_doc(db: web::Data<DatabaseConnection>, path: web::Path<i32>) -> impl Responder {
    let id = path.into_inner();
    let _ = document::Entity::delete_by_id(id).exec(db.get_ref()).await;
    HttpResponse::Ok().json("Deleted")
}

async fn delete_user(db: web::Data<DatabaseConnection>, path: web::Path<i32>) -> impl Responder {
    let id = path.into_inner();
    let _ = user::Entity::delete_by_id(id).exec(db.get_ref()).await;
    HttpResponse::Ok().json("User deleted")
}

async fn update_user(db: web::Data<DatabaseConnection>, path: web::Path<i32>, req: web::Json<UpdateUserReq>) -> impl Responder {
    let id = path.into_inner();
    let user_opt = user::Entity::find_by_id(id).one(db.get_ref()).await.unwrap();
    
    if let Some(u) = user_opt {
        let mut active: user::ActiveModel = u.into();
        active.full_name = Set(req.full_name.clone());
        active.username = Set(req.username.clone());
        active.role = Set(req.role.clone());
        
        active.update(db.get_ref()).await.unwrap();
        HttpResponse::Ok().json("Updated")
    } else {
        HttpResponse::NotFound().body("User not found")
    }
}

async fn add_comment(db: web::Data<DatabaseConnection>, req: web::Json<CommentReq>) -> impl Responder {
    let now = Local::now().format("%Y-%m-%d %H:%M").to_string();
    let comment = comment::ActiveModel {
        doc_id: Set(req.doc_id),
        admin_name: Set(req.username.clone()),
        text: Set(req.text.clone()),
        created_at: Set(now),
        ..Default::default()
    };
    comment::Entity::insert(comment).exec(db.get_ref()).await.unwrap();
    log_audit(db.get_ref(), req.username.clone(), "COMMENT", &format!("Doc: {}", req.doc_id)).await;
    HttpResponse::Ok().json("Added")
}

async fn get_comments(db: web::Data<DatabaseConnection>, path: web::Path<i32>) -> impl Responder {
    let id = path.into_inner();
    let comments = comment::Entity::find().filter(comment::Column::DocId.eq(id)).all(db.get_ref()).await.unwrap();
    HttpResponse::Ok().json(comments)
}

async fn get_users(db: web::Data<DatabaseConnection>) -> impl Responder {
    let users = user::Entity::find().all(db.get_ref()).await.unwrap();
    HttpResponse::Ok().json(users)
}

async fn get_audit(db: web::Data<DatabaseConnection>) -> impl Responder {
    let logs = audit::Entity::find().order_by_desc(audit::Column::Id).limit(100).all(db.get_ref()).await.unwrap();
    HttpResponse::Ok().json(logs)
}

async fn get_stats(db: web::Data<DatabaseConnection>) -> impl Responder {
    let u_c = user::Entity::find().count(db.get_ref()).await.unwrap();
    let d_c = document::Entity::find().count(db.get_ref()).await.unwrap();
    let a_c = audit::Entity::find().count(db.get_ref()).await.unwrap();
    HttpResponse::Ok().json(serde_json::json!({"users": u_c, "docs": d_c, "audits": a_c}))
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    let db_url = env::var("DATABASE_URL").expect("DB URL set");
    let mut db: Option<DatabaseConnection> = None;
    for i in 1..=10 {
        if let Ok(conn) = Database::connect(&db_url).await { db = Some(conn); break; }
        sleep(Duration::from_secs(3)).await;
    }
    let db = db.expect("DB Failed");

    let builder = db.get_database_backend();
    let schema = Schema::new(builder);
    let _ = db.execute(builder.build(&schema.create_table_from_entity(models::user::Entity))).await;
    let _ = db.execute(builder.build(&schema.create_table_from_entity(models::document::Entity))).await;
    let _ = db.execute(builder.build(&schema.create_table_from_entity(models::audit::Entity))).await;
    let _ = db.execute(builder.build(&schema.create_table_from_entity(models::comment::Entity))).await;

    HttpServer::new(move || {
        App::new()
            .wrap(Cors::permissive())
            .app_data(web::JsonConfig::default().limit(20 * 1024 * 1024))
            .app_data(web::Data::new(db.clone()))
            .route("/api/register", web::post().to(register))
            .route("/api/login", web::post().to(login))
            .route("/api/documents", web::post().to(create_doc))
            .route("/api/documents", web::get().to(get_docs))
            .route("/api/documents/{id}", web::delete().to(delete_doc))
            .route("/api/comments", web::post().to(add_comment))
            .route("/api/comments/{id}", web::get().to(get_comments))
            .route("/api/users", web::get().to(get_users))
            .route("/api/users/{id}", web::delete().to(delete_user))
            .route("/api/users/{id}", web::put().to(update_user)) 
            .route("/api/audit", web::get().to(get_audit))
            .route("/api/stats", web::get().to(get_stats))
    })
    .bind(("0.0.0.0", 8080))?
    .run()
    .await
}
