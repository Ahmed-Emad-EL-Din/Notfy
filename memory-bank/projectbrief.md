# Project Brief: RelaySignal / Notfy

## Overview
RelaySignal (also referred to as Notfy) is a multi-tenant task management and notification platform designed for admin-led teams. It enables administrators to create tasks, dispatch notifications, and manage linked users through invite links.

## Core Requirements
- **Authentication**: Firebase Auth (Email/Password + Google OAuth)
- **Task Management**: Full CRUD with rich text, attachments, voice notes, polls, and recurring tasks
- **Multi-Tenancy**: Admin workspace model with invite links for user onboarding
- **Notifications**: Browser notifications, Web Push (service worker), and Telegram integration
- **PWA Support**: Progressive Web App with offline capabilities

## Goals
1. Provide a seamless task management experience for teams
2. Ensure reliable notification delivery across multiple channels
3. Support offline task scheduling where browser APIs permit
4. Maintain a responsive, mobile-friendly UI

## Target Users
- Team administrators who need to assign tasks and broadcast notifications
- Team members who need to receive, track, and respond to tasks

## Success Metrics
- Reliable cross-device notification delivery
- Smooth mobile experience
- Low friction user onboarding via invite links
